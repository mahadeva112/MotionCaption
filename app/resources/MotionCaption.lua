-- MotionCaption bridge  (Workspace -> Scripts -> MotionCaption)
--
-- Places the captions the MotionCaption app sent as editable, animated Text+ titles.
-- Resolve Free cannot be driven from outside, so the app writes a job file and this
-- script, run from inside Resolve, does the work:
--   %APPDATA%\MotionCaption\job.lua      what to build (written by the app)
--   %APPDATA%\MotionCaption\result.json  what happened (read by the app)
--   %APPDATA%\MotionCaption\bridge.log   details
--   %APPDATA%\MotionCaption\templates\  one Text+ template per frame rate, imported into a "MotionCaption" bin when needed
--
-- Safe by design: captions go on new video tracks; nothing of yours on the timeline is
-- changed or removed. Sending again updates: captions that did not change stay untouched,
-- the changed ones are made again. The project is not saved. Frames come from the timeline's own frame rate.
-- With nothing new to place (no job yet, or this one is already in), it opens the app instead.
-- Resolve's Lua host has no `require`, and os.execute flashes a console, so neither is used.

local BASE = (os.getenv("APPDATA") or os.getenv("TEMP") or ".") .. "\\MotionCaption\\"
-- First thing: a stamp that this script started, so the app can tell a click reached Resolve
pcall(function() local f = io.open(BASE .. "started.txt", "wb"); if f then f:write(os.date("%Y-%m-%dT%H:%M:%S")); f:close() end end)
local JOB, RESULT, LOG, TEMPLATES = BASE .. "job.lua", BASE .. "result.json", BASE .. "bridge.log", BASE .. "templates\\"
-- Read by the app while this runs, to show a progress bar (Resolve's own window is busy)
local PROGRESS = BASE .. "progress.json"
-- The open timeline's tracks and subtitles, read by the app (written on every click)
local TIMELINE = BASE .. "timeline.json"
-- What the last send made, from before each timeline had its own record (sent_*.lua, see
-- record_path). Still read once, so a send made by an older version is replaced, not doubled.
local LAST_SEND = BASE .. "last_send.lua"
-- While the Link window is open it writes the time here every half second; the app reads
-- it to know a Send goes straight in. refresh.txt is the app asking for a new timeline read.
local LINK, REFRESH = BASE .. "link.json", BASE .. "refresh.txt"

-- Follower "Order" values do not match the list shown in Fusion. From stills:
-- 1 revealed right to left (Spike 3), 2 revealed from the middle out (bridge test 1),
-- so the list is offset by two and 0 should be left to right.
local ORDER = { ltr = 0, rtl = 1 }

-- Test runs log animated values at a few frames, to check them without looking
local probes = {}

local lines = {}
local function log(s)
    s = tostring(s)
    lines[#lines + 1] = s
    print("[MotionCaption] " .. s)
end

local function try(fn)
    local ok, a = pcall(fn)
    if ok then return a end
    return nil, a
end

local function read_file(p)
    local f = io.open(p, "rb")
    if not f then return nil end
    local s = f:read("*a"); f:close()
    return s
end

local function write_file(p, s)
    local f = io.open(p, "wb")
    if not f then return false end
    f:write(s); f:close()
    return true
end

-- Resolve's Lua tables are not always {index = object}, and some carry extra
-- string/number entries; keep only the objects, from whichever side they are on
local function objects(t)
    local out = {}
    for k, v in pairs(t or {}) do
        if type(v) == "userdata" then out[#out + 1] = v
        elseif type(k) == "userdata" then out[#out + 1] = k end
    end
    return out
end

local function json(v)
    local t = type(v)
    if t == "nil" then return "null" end
    if t == "boolean" or t == "number" then return tostring(v) end
    if t == "string" then
        return '"' .. v:gsub('[%c"\\]', function(c)
            local map = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
            return map[c] or string.format("\\u%04x", c:byte())
        end) .. '"'
    end
    local parts = {}
    if #v > 0 or next(v) == nil then
        for _, x in ipairs(v) do parts[#parts + 1] = json(x) end
        return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, x in pairs(v) do parts[#parts + 1] = json(tostring(k)) .. ":" .. json(x) end
    return "{" .. table.concat(parts, ",") .. "}"
end

local rv = resolve or (fusion and fusion:GetResolve())
local result = { ok = false, placed = 0, failed = 0, errors = {} }
-- Set when there is nothing to place: the script opens the app and leaves result.json alone
local idle = false

-- The installer, and the app on every start, write where the app is to app.txt
-- (the install folder can be changed during setup)
local function is_file(p)
    local f = io.open(p, "rb")
    if not f then return false end
    f:close()
    return true
end

local function open_app()
    local path = (read_file(BASE .. "app.txt") or ""):gsub("^%s+", ""):gsub("%s+$", "")
    if path == "" or not is_file(path) then
        path = (os.getenv("LOCALAPPDATA") or "") .. "\\Programs\\MotionCaption Studio\\MotionCaption Studio.exe"
    end
    if not is_file(path) then return false end
    -- The shell's Open: starts the exe without the console window os.execute would flash
    return (try(function() bmd.openfileexternal("Open", path); return true end))
end

local function fail(msg)
    result.errors[#result.errors + 1] = msg
    log("FAIL  " .. msg)
end

-- ── Job ────────────────────────────────────────────────────────────────────
local function load_job()
    local fn, err = loadfile(JOB)
    if not fn then return nil, "No job found. In MotionCaption, press “Send to Resolve” first. (" .. tostring(err) .. ")" end
    setfenv(fn, {}) -- no globals: the job can only be data
    local ok, job = pcall(fn)
    if not ok or type(job) ~= "table" then return nil, "The job file could not be read: " .. tostring(job) end
    if job.version ~= 1 or type(job.cues) ~= "table" then return nil, "This job was made by a newer MotionCaption. Update the Resolve script." end
    return job
end

-- ── Frames ─────────────────────────────────────────────────────────────────
local fps = 24
local function frames(ms) return math.floor(ms * fps / 1000 + 0.5) end

-- "23.976", "29.97 DF", "60" → frames per second. NTSC rates are exact (24000/1001…):
-- SRT times are real time, and 23.976 vs 24000/1001 drifts a frame every ~12 hours, but
-- there is no reason to drift at all.
local function parse_rate(s)
    local n = tonumber(tostring(s or ""):match("^%s*([%d%.]+)"))
    if not n or n <= 0 then return nil end
    for _, r in ipairs({ 24, 30, 48, 60, 120 }) do
        if math.abs(n - r * 1000 / 1001) < 0.01 then return r * 1000 / 1001 end
    end
    return n
end

-- Timeline frame number → timecode Resolve accepts. Drop-frame timecode skips frame
-- numbers 0 and 1 (0–3 at 59.94) each minute, except every tenth minute.
local function timecode(frame, rate, dropFrame)
    local nominal = math.floor(rate + 0.5)
    local sep = ":"
    if dropFrame and math.abs(rate - nominal) > 0.001 then
        local drop = math.floor(nominal / 15 + 0.5) -- 2 at 29.97, 4 at 59.94
        local per10 = nominal * 600 - drop * 9
        local perMin = nominal * 60 - drop
        local tens, rest = math.floor(frame / per10), frame % per10
        frame = frame + drop * 9 * tens
        if rest > drop then frame = frame + drop * math.floor((rest - drop) / perMin) end
        sep = ";"
    end
    local s = math.floor(frame / nominal)
    return string.format("%02d:%02d:%02d%s%02d", math.floor(s / 3600), math.floor(s / 60) % 60, s % 60, sep, frame % nominal)
end

-- ── Template ───────────────────────────────────────────────────────────────
-- AppendToTimeline reads a caption's length in the template clip's own frame rate and
-- converts it to the timeline's, rounding down (Spike 4): a 24 fps template makes 60
-- frames 62 at 25 fps, and some lengths cannot be had at all. So there is one template
-- per rate (templates\Template_<tag>.drb), each imported into the MotionCaption bin the
-- first time a timeline at that rate needs it. Exact at 24, 25, 30, 50, 60 (Spike 5).
local function template_tag(rate)
    local ntsc = { [24] = "23976", [30] = "2997", [60] = "5994" }
    for r, tag in pairs(ntsc) do
        if math.abs(rate - r * 1000 / 1001) < 0.001 then return tag end
    end
    local whole = math.floor(rate + 0.5)
    if math.abs(rate - whole) < 0.001 then return tostring(whole) end
end

local function is_title(clip)
    return tostring(try(function() return clip:GetClipProperty("Type") end)):match("Fusion Title") ~= nil
end

local function clip_rate(clip) return parse_rate(try(function() return clip:GetClipProperty("FPS") end)) end

-- First Fusion Title in a folder tree that passes `want`
local function find_title(folder, depth, want)
    if not folder or depth > 3 then return nil end
    for _, clip in ipairs(objects(try(function() return folder:GetClipList() end))) do
        if is_title(clip) and (not want or want(clip)) then return clip end
    end
    for _, sub in ipairs(objects(try(function() return folder:GetSubFolderList() end))) do
        local c = find_title(sub, depth + 1, want)
        if c then return c end
    end
end

-- The template for a timeline rate, and the rate it holds
local function template_of(mp, rate)
    local root = mp:GetRootFolder()
    local bin
    for _, sub in ipairs(objects(try(function() return root:GetSubFolderList() end))) do
        if sub:GetName() == "MotionCaption" then bin = sub end
    end
    local function matches(clip)
        local r = clip_rate(clip)
        return r ~= nil and math.abs(r - rate) < 0.0001
    end
    local t = bin and find_title(bin, 0, matches)
    if t then return t, rate end

    local tag = template_tag(rate)
    local file = tag and TEMPLATES .. "Template_" .. tag .. ".drb"
    if file and read_file(file) then
        bin = bin or try(function() return mp:AddSubFolder(root, "MotionCaption") end)
        local sub = bin and try(function() return mp:AddSubFolder(bin, "Text+ " .. tag .. " fps") end)
        local was = try(function() return mp:GetCurrentFolder() end)
        if sub or bin then try(function() mp:SetCurrentFolder(sub or bin) end) end
        local ok = try(function() return mp:ImportFolderFromFile(file) end)
        if was then try(function() mp:SetCurrentFolder(was) end) end
        t = find_title(sub or bin, 0, matches)
        log((t and "OK    " or "WARN  ") .. "Imported the " .. tag .. " fps Text+ template into the MotionCaption bin → " .. tostring(ok)
            .. (t and "" or (" (it reads " .. tostring(find_title(sub or bin, 0) and clip_rate(find_title(sub or bin, 0))) .. " fps)")))
        if t then return t, rate end
    end

    -- No template at this rate: any Text+ works, with lengths converted and possibly a frame long
    t = (bin and find_title(bin, 0)) or find_title(root, 0)
    if t then
        log("WARN  No " .. string.format("%.3f", rate) .. " fps template; using “" .. t:GetName() .. "” at "
            .. tostring(clip_rate(t)) .. " fps. Some captions may be a frame longer than asked.")
        return t, clip_rate(t) or rate
    end
end

local function comp_of(v, i) if type(v) == "table" then return v[i] end return v end

-- ── Drawn captions ─────────────────────────────────────────────────────────
-- A caption the app drew itself as PNG frames with transparency (job cue.render). It is
-- imported once as an image sequence into MotionCaption › Drawn and placed like any clip:
-- no Text+, no Fusion comp, nothing that Resolve Free draws differently.
local drawnBin, drawnItems = nil, {}
local function drawn_bin(mp)
    if drawnBin then return drawnBin end
    local root = mp:GetRootFolder()
    local bin
    for _, sub in ipairs(objects(try(function() return root:GetSubFolderList() end))) do
        if sub:GetName() == "MotionCaption" then bin = sub end
    end
    bin = bin or try(function() return mp:AddSubFolder(root, "MotionCaption") end)
    if not bin then return nil end
    for _, sub in ipairs(objects(try(function() return bin:GetSubFolderList() end))) do
        if sub:GetName() == "Drawn" then drawnBin = sub end
    end
    drawnBin = drawnBin or try(function() return mp:AddSubFolder(bin, "Drawn") end)
    return drawnBin
end

-- The Media Pool clip of a drawn caption's frames, imported the first time it is needed
local function drawn_item(mp, r, rateText)
    if drawnItems[r.dir] then return drawnItems[r.dir] end
    local bin = drawn_bin(mp)
    if not bin then return nil, "could not make the MotionCaption › Drawn bin in the Media Pool" end
    -- Each caption's frames have their own folder, named by what they show
    local key = tostring(r.dir):match("([^\\/]+)$") or r.dir
    for _, clip in ipairs(objects(try(function() return bin:GetClipList() end))) do
        local path = tostring(try(function() return clip:GetClipProperty("File Path") end) or "")
        if path:find(key, 1, true) then drawnItems[r.dir] = clip; return clip end
    end
    local was = try(function() return mp:GetCurrentFolder() end)
    try(function() mp:SetCurrentFolder(bin) end)
    local got = objects(try(function()
        return mp:ImportMedia({ { FilePath = r.dir .. "\\f_%05d.png", StartIndex = 0, EndIndex = r.frames - 1 } })
    end))
    local how = "ImportMedia"
    if #got == 0 then
        -- The folder holds nothing but the frames, so Resolve takes it as one sequence
        got = objects(try(function() return rv:GetMediaStorage():AddItemListToMediaPool({ r.dir }) end))
        how = "AddItemListToMediaPool"
    end
    if was then try(function() mp:SetCurrentFolder(was) end) end
    local clip = got[1]
    if not clip then return nil, "Resolve did not take the drawn frames in " .. r.dir end
    local frames = tonumber(try(function() return clip:GetClipProperty("Frames") end))
    -- An image sequence plays at the project's rate; it must be the timeline's
    local rate = clip_rate(clip)
    local set
    if not rate or math.abs(rate - fps) > 0.0001 then
        set = try(function() return clip:SetClipProperty("FPS", rateText) end)
        rate = clip_rate(clip)
    end
    -- PNG transparency: Resolve usually reads it; the log says when it does not
    local alpha = tostring(try(function() return clip:GetClipProperty("Alpha mode") end))
    if alpha == "None" then
        try(function() clip:SetClipProperty("Alpha mode", "Straight") end)
        alpha = alpha .. " → " .. tostring(try(function() return clip:GetClipProperty("Alpha mode") end))
    end
    log(string.format("OK    Drawn frames %s: %s, %s frames at %s fps%s, alpha %s", key, how, tostring(frames), tostring(rate),
        set ~= nil and (" (set " .. tostring(set) .. ")") or "", alpha))
    if not rate or math.abs(rate - fps) > 0.0001 then
        return nil, "the drawn frames came in at " .. tostring(rate) .. " fps, not the timeline's " .. tostring(rateText)
            .. ". Set Project Settings → Timeline frame rate to " .. tostring(rateText) .. ", then Send again."
    end
    drawnItems[r.dir] = clip
    return clip
end


-- App keys {ms, v, ease = {x1, y1, x2, y2}} → Fusion keyframes with Bezier handles.
-- The ease runs from a key to the next one, exactly like CSS cubic-bezier.
-- SetKeyFrames takes handles as offsets from their own key (bridge test 2 probes),
-- unlike .setting files, which store them as absolute positions.
local function spline_keys(keys, len, i)
    local ks = {}
    for _, k in ipairs(keys) do
        local f = math.max(0, math.min(len - 1, frames(k.ms)))
        if #ks > 0 and ks[#ks].f == f then ks[#ks] = nil end
        ks[#ks + 1] = { f = f, v = comp_of(k.v, i), e = k.ease or { 0, 0, 1, 1 } }
    end
    local out = {}
    for j, k in ipairs(ks) do out[k.f] = { k.v } end
    for j = 1, #ks - 1 do
        local a, b = ks[j], ks[j + 1]
        local dx, dv = b.f - a.f, b.v - a.v
        out[a.f].RH = { a.e[1] * dx, a.e[2] * dv }
        out[b.f].LH = { (a.e[3] - 1) * dx, (a.e[4] - 1) * dv }
    end
    return out
end

local function driver(tool, input)
    local o = try(function() return tool[input]:GetConnectedOutput() end)
    return o and o:GetTool()
end

local function animate_number(tool, input, keys, len, i)
    tool:AddModifier(input, "BezierSpline")
    local sp = driver(tool, input)
    assert(sp, "no spline on " .. input)
    sp:SetKeyFrames(spline_keys(keys, len, i), true)
end

local xyListed, mcListed = false, false
local function animate(tool, track, len)
    probes[#probes + 1] = { tool = tool, input = track.input, len = len, keys = track.keys }
    local first = track.keys[1] and track.keys[1].v
    if type(first) == "table" then
        tool:AddModifier(track.input, "XYPath")
        local xy = driver(tool, track.input)
        assert(xy, "no XYPath on " .. track.input)
        if not xyListed then
            xyListed = true
            local ids = {}
            for _, inp in ipairs(objects(try(function() return xy:GetInputList() end))) do
                local at = try(function() return inp:GetAttrs() end) or {}
                ids[#ids + 1] = tostring(at.INPS_ID) .. "=" .. tostring(try(function() return xy:GetInput(at.INPS_ID) end))
            end
            log("      XYPath inputs: " .. table.concat(ids, ", "))
        end
        animate_number(xy, "X", track.keys, len, 1)
        animate_number(xy, "Y", track.keys, len, 2)
    else
        animate_number(tool, track.input, track.keys, len)
    end
end

local function shifted(track, ms)
    if ms == 0 then return track end
    local keys = {}
    for i, k in ipairs(track.keys) do keys[i] = { ms = k.ms + ms, v = k.v, ease = k.ease } end
    return { input = track.input, keys = keys }
end

local function set_value(tool, input, v)
    if type(v) == "table" then tool:SetInput(input, { v[1], v[2] }) else tool:SetInput(input, v) end
end

-- ── One caption ────────────────────────────────────────────────────────────
local function style_text(t, cue, color)
    local L = cue.look
    t:SetInput("StyledText", cue.text)
    t:SetInput("Font", L.font)
    t:SetInput("Style", L.style)
    t:SetInput("Size", L.size)
    t:SetInput("CharacterSpacing", L.tracking)
    try(function() t:SetInput("LineSpacing", L.lineSpacing) end)
    -- Lines left / centre / right (0, 1, 2) inside a block whose middle stays on Center.
    -- HorizontallyJustified is full justification, not alignment: at ±1 it spread or
    -- squeezed the words to fill the width (bridge test 5), so it stays 0.
    try(function() t:SetInput("HorizontalJustificationNew", L.align) end)
    try(function() t:SetInput("HorizontallyJustified", 0) end)
    try(function() t:SetInput("HorizontalLeftCenterRight", 0) end)
    t:SetInput("Red1", color[1]); t:SetInput("Green1", color[2]); t:SetInput("Blue1", color[3])
    t:SetInput("Center", { L.center[1], L.center[2] })
end

-- Outline, shadow and the box behind the text: Text+ shading elements 2, 3 and 4.
-- An element's own inputs only exist once it is enabled (bridge test 4: Offset3, Level4…
-- were missing from the input list), so Enabled goes first.
local function set_all(t, inputs) for id, v in pairs(inputs) do try(function() t:SetInput(id, v) end) end end
local function element(t, n, inputs)
    try(function() t:SetInput("Enabled" .. n, 1) end)
    set_all(t, inputs)
end
local function plain_copy(t) for n = 2, 4 do try(function() t:SetInput("Enabled" .. n, 0) end) end end
local function shade(t, L, withBox)
    if L.outline then
        local c = L.outline.color
        element(t, 2, { ElementShape2 = 1, Thickness2 = L.outline.width, Red2 = c[1], Green2 = c[2], Blue2 = c[3], Opacity2 = 1 })
    end
    if L.shadow then
        local c, d = L.shadow.color, L.shadow.distance * 0.02
        element(t, 3, { Red3 = c[1], Green3 = c[2], Blue3 = c[3], Opacity3 = L.shadow.opacity,
            SoftnessX3 = L.shadow.blur * 16, SoftnessY3 = L.shadow.blur * 16, Offset3 = { d, -d } })
    end
    if withBox and L.box then
        local c = L.box.color
        element(t, 4, { ElementShape4 = 2, Level4 = 1, Red4 = c[1], Green4 = c[2], Blue4 = c[3], Opacity4 = L.box.opacity,
            ExtendHorizontal4 = L.box.pad * 0.4, ExtendVertical4 = L.box.pad * 0.25, Round4 = L.box.round })
    end
end

local function add_follower(t, text)
    t:AddModifier("StyledText", "StyledTextFollower")
    local fo = driver(t, "StyledText")
    assert(fo and fo:GetAttrs().TOOLS_RegID == "StyledTextFollower", "Follower not attached")
    fo:SetInput("Text", text)
    return fo
end

local function build(item, cue)
    local comp = item:GetFusionCompByIndex(1)
    local tp = comp and comp:FindTool("Template")
    assert(tp, "caption has no Text+ named Template")
    local len = item:GetDuration()
    local out
    for _, t in ipairs(objects(comp:GetToolList(false, "MediaOut"))) do out = t break end

    local by = { text = {}, move = {}, letters = {} }
    for _, tr in ipairs(cue.tracks or {}) do
        if by[tr.target] then by[tr.target][#by[tr.target] + 1] = tr end
    end

    comp:Lock()
    local ok, err = pcall(function()
        style_text(tp, cue, cue.look.fill)
        shade(tp, cue.look, true)
        for _, fx in ipairs(cue.fixed or {}) do if fx.target == "text" then set_value(tp, fx.input, fx.v) end end
        for _, tr in ipairs(by.text) do animate(tp, tr, len) end

        if cue.letters then
            local fo = add_follower(tp, cue.text)
            fo:SetInput("Order", ORDER[cue.letters.order] or ORDER.ltr)
            fo:SetInput("Delay", cue.letters.stepMs * fps / 1000)
            for _, tr in ipairs(by.letters) do animate(fo, tr, len) end
        end

        -- A copy of the caption laid out the same way, hidden except for one word's letters
        local fade
        for _, tr in ipairs(by.text) do if tr.input == "Opacity1" then fade = tr end end
        local function word_copy(w, color)
            local ov = comp:AddTool("TextPlus", -32768, -32768)
            style_text(ov, cue, color)
            -- Only the fill: outline and shadow ignore the Follower's opacity and drew for
            -- every hidden letter, darkening the caption (bridge test 4). The caption's own
            -- outline and shadow show around the word underneath.
            plain_copy(ov)
            ov:SetInput("Opacity1", 0)
            for _, fx in ipairs(cue.fixed or {}) do if fx.target == "text" then set_value(ov, fx.input, fx.v) end end
            for _, tr in ipairs(by.text) do if tr.input ~= "Opacity1" then animate(ov, tr, len) end end
            local fo = add_follower(ov, cue.text)
            fo:SetInput("Range", 1) -- Character Range
            fo:SetInput("FirstCharacter", w.first)
            fo:SetInput("LastCharacter", w.last)
            fo:SetInput("Delay", 0)
            return ov, fo
        end
        local SOLID = { input = "Opacity1", keys = { { ms = 0, v = 1 }, { ms = 1000, v = 1 } } }

        -- A word with its own size: its own Text+ in the blank room the caption leaves,
        -- with the caption's text animation (fade, spacing, blur) and a Follower for effects
        local function solo_copy(w, color)
            local ov = comp:AddTool("TextPlus", -32768, -32768)
            style_text(ov, { text = w.solo.text, look = cue.look }, color)
            ov:SetInput("Size", w.solo.size)
            ov:SetInput("Center", { w.solo.center[1], w.solo.center[2] })
            try(function() ov:SetInput("HorizontalJustificationNew", 1) end)
            shade(ov, cue.look, false)
            for _, fx in ipairs(cue.fixed or {}) do if fx.target == "text" then set_value(ov, fx.input, fx.v) end end
            for _, tr in ipairs(by.text) do animate(ov, tr, len) end
            local fo = add_follower(ov, w.solo.text)
            fo:SetInput("Delay", 0)
            return ov, fo
        end

        local last = tp
        -- Words whose effect moves their letters: cut the plain word out of the caption,
        -- or it shows behind the animated one. A Merge set to Held Out still drew the mask
        -- itself (word test 2), so the cut is a Matte Control garbage matte instead.
        -- (Words that only fade in and out, like word-by-word highlights, sit on their
        -- plain copy and need no cut.)
        local function moves(w)
            for _, tr in ipairs(w.tracks or {}) do if tr.input ~= "Opacity1" then return true end end
            return false
        end
        for _, w in ipairs(cue.words or {}) do
            if not w.solo and moves(w) then
                local mask, mfo = word_copy(w, { 1, 1, 1 })
                animate(mfo, SOLID, len) -- Follower values only apply when animated
                local cut = comp:AddTool("MatteControl", -32768, -32768)
                cut:ConnectInput("Background", last)
                cut:ConnectInput("Garbage.Matte", mask) -- the input list says "Garbage.Matte"
                try(function() cut:SetInput("PostMultiplyImage", 1) end) -- clear the colour where alpha goes
                if not mcListed then
                    mcListed = true
                    local ids = {}
                    for _, inp in ipairs(objects(try(function() return cut:GetInputList() end))) do
                        local at = try(function() return inp:GetAttrs() end) or {}
                        ids[#ids + 1] = tostring(at.INPS_ID)
                    end
                    log("      MatteControl Garbage.Matte ← " .. tostring(try(function() return cut["Garbage.Matte"]:GetConnectedOutput():GetTool().Name end)))
                end
                last = cut
            end
        end

        -- Each selected word on top, with its colour and effect
        for _, w in ipairs(cue.words or {}) do
            local copy = w.solo and solo_copy or word_copy
            local ov, fo = copy(w, w.color)
            local own, shift = {}, 0
            -- With a letter preset the word must arrive when the cascade reaches it,
            -- not at the start: run the same letter tracks, delayed to the word's first letter
            if cue.letters then
                local pr = w.probe or {} -- test runs only: other Follower settings to compare
                fo:SetInput("Order", pr.order or ORDER[cue.letters.order] or ORDER.ltr)
                fo:SetInput("Delay", cue.letters.stepMs * fps / 1000)
                shift = pr.noShift and 0 or w.first * cue.letters.stepMs
                for _, tr in ipairs(by.letters) do own[tr.input] = true; animate(fo, shifted(tr, shift), len) end
                if w.probe then
                    local vals = {}
                    for _, id in ipairs({ "Range", "FirstCharacter", "LastCharacter", "Order", "Delay", "DelayType" }) do
                        vals[#vals + 1] = id .. "=" .. tostring(try(function() return fo:GetInput(id) end))
                    end
                    log(string.format("      #%s word follower: %s, letter keys shifted %d ms", tostring(cue.n), table.concat(vals, " "), shift))
                end
            end
            for _, tr in ipairs(w.tracks or {}) do
                if not own[tr.input] then own[tr.input] = true; animate(fo, shifted(tr, shift), len) end
            end
            -- The word's letters fade with the caption (Follower values only apply when animated).
            -- A solo word already fades on its own Text+.
            if not own.Opacity1 and not w.solo then
                animate(fo, fade or SOLID, len)
            end
            -- A box behind just this word: the copy's box, per character, shows only where
            -- its Follower shows letters
            -- (The app makes every boxed word a solo word: a box on a Follower copy drew
            -- behind every letter of the caption, bridge test 4.)
            if w.box and w.solo then
                element(ov, 4, { ElementShape4 = 2, Level4 = 1, Red4 = w.box[1], Green4 = w.box[2], Blue4 = w.box[3],
                    Opacity4 = 1, ExtendHorizontal4 = 0.08, ExtendVertical4 = 0.06, Round4 = 0.3 })
            end
            -- Glow: a soft copy of the word in its colour, under it
            if w.glow then
                local g, gfo = copy(w, w.color)
                plain_copy(g)
                set_all(g, { SoftnessX1 = 12, SoftnessY1 = 12, SoftnessOnFillColorToo1 = 1 })
                local gOwn = {}
                for _, tr in ipairs(w.tracks or {}) do gOwn[tr.input] = true; animate(gfo, shifted(tr, shift), len) end
                if not gOwn.Opacity1 and not w.solo then animate(gfo, fade or SOLID, len) end
                local gm = comp:AddTool("Merge", -32768, -32768)
                gm:ConnectInput("Background", last)
                gm:ConnectInput("Foreground", g)
                last = gm
            end
            local mg = comp:AddTool("Merge", -32768, -32768)
            mg:ConnectInput("Background", last)
            mg:ConnectInput("Foreground", ov)
            last = mg
        end

        if #by.move > 0 then
            local xf = comp:AddTool("Transform", -32768, -32768)
            xf:ConnectInput("Input", last)
            xf:SetInput("Pivot", { cue.look.center[1], cue.look.center[2] })
            for _, tr in ipairs(by.move) do animate(xf, tr, len) end
            last = xf
        end
        if last ~= tp then out:ConnectInput("Input", last) end
    end)
    comp:Unlock()
    if not ok then error(err, 0) end
end

local function progress(jobId, phase, done, total)
    write_file(PROGRESS, json({ jobId = jobId, phase = phase, done = done, total = total }))
end

-- Test runs: every key must sit on its own frame with its own value. Keys that land on
-- the same frame keep the last one, as spline_keys does.
local function check_keys(p, n)
    local want, order = {}, {}
    for _, k in ipairs(p.keys or {}) do
        local f = math.max(0, math.min(p.len - 1, frames(k.ms)))
        if want[f] == nil then order[#order + 1] = f end
        want[f] = k.v
    end
    local bad = 0
    for _, f in ipairs(order) do
        local v = try(function() return p.tool:GetInput(p.input, f) end)
        local w = want[f]
        local same
        if type(w) == "table" then
            same = type(v) == "table" and math.abs((v[1] or 1e9) - w[1]) < 1e-3 and math.abs((v[2] or 1e9) - w[2]) < 1e-3
        else
            same = type(v) == "number" and math.abs(v - w) < 1e-3 * math.max(1, math.abs(w))
        end
        if not same then
            bad = bad + 1
            if bad <= 3 then
                log(string.format("      KEY   #%s %s.%s frame %d: want %s, got %s", tostring(n),
                    tostring(try(function() return p.tool.Name end)), p.input, f,
                    type(w) == "table" and string.format("(%.3f, %.3f)", w[1], w[2]) or tostring(w),
                    type(v) == "table" and string.format("(%.3f, %.3f)", v[1] or -1, v[2] or -1) or tostring(v)))
            end
        end
    end
    return #order, bad
end

-- Test runs: a new empty timeline at a given frame rate, keeping the project's frame size
local function new_timeline(mp, project, name, rate)
    local tl = try(function() return mp:CreateEmptyTimeline(name) end)
    if not tl then return nil, "Could not create timeline " .. name end
    project:SetCurrentTimeline(tl)
    if rate then
        local w, h = project:GetSetting("timelineResolutionWidth"), project:GetSetting("timelineResolutionHeight")
        local r = {
            custom = try(function() return tl:SetSetting("useCustomSettings", "1") end),
            width = try(function() return tl:SetSetting("timelineResolutionWidth", w) end),
            height = try(function() return tl:SetSetting("timelineResolutionHeight", h) end),
            rate = try(function() return tl:SetSetting("timelineFrameRate", rate.rate) end),
            df = try(function() return tl:SetSetting("timelineDropFrameTimecode", rate.dropFrame and "1" or "0") end),
        }
        log(string.format("      SetSetting custom=%s size=%s/%s rate=%s df=%s → reads %s fps, DF %s, %sx%s",
            tostring(r.custom), tostring(r.width), tostring(r.height), tostring(r.rate), tostring(r.df),
            tostring(tl:GetSetting("timelineFrameRate")), tostring(tl:GetSetting("timelineDropFrameTimecode")),
            tostring(tl:GetSetting("timelineResolutionWidth")), tostring(tl:GetSetting("timelineResolutionHeight"))))
        local got = parse_rate(tl:GetSetting("timelineFrameRate"))
        if not got or math.abs(got - parse_rate(rate.rate)) > 0.001 then
            return nil, "Timeline " .. name .. " stayed at " .. tostring(tl:GetSetting("timelineFrameRate")) .. " fps (asked for " .. rate.rate .. ")"
        end
    end
    return tl
end

-- ── What was sent ──────────────────────────────────────────────────────────
-- Each send leaves a record of the captions it made: one file per project, timeline and
-- source (the captions' track name, job.trackName), listing every caption's track, first
-- frame, length and content signature (job cue.sig).
-- The next send from that source keeps the captions that are still wanted exactly as they
-- are, so an update only touches what changed, and whatever was adjusted by hand in
-- Resolve on an unchanged caption stays. Sources keep apart: sending the Text+ on one
-- track (a super) leaves the subtitles' captions alone, and the other way round.
local function record_path(projectName, timelineName, source)
    local h = 5381
    local key = tostring(projectName) .. "\n" .. tostring(timelineName) .. (source and ("\n" .. tostring(source)) or "")
    for c in key:gmatch(".") do h = (h * 33 + c:byte()) % 2147483648 end
    return BASE .. string.format("sent_%08x.lua", h)
end

-- Does a record list a track this source makes ("MC Subtitle 1", "MC Subtitle 1 2", …)?
local function made_by(rec, trackName)
    for _, n in ipairs(type(rec.tracks) == "table" and rec.tracks or {}) do
        n = tostring(n)
        if n == trackName or n:sub(1, #trackName + 1) == trackName .. " " then return true end
    end
    for _, c in ipairs(type(rec.clips) == "table" and rec.clips or {}) do
        if c.track == trackName then return true end
    end
    return false
end

local function load_record(path)
    local fn = loadfile(path)
    local t = fn and (setfenv(fn, {}) and try(fn))
    return type(t) == "table" and t or nil
end

-- Resolve draws a new clip that sits under the playhead as soon as it is placed, before its
-- comp is built, and keeps showing that first render: the clip's Follower (Typewriter, Letter
-- Cascade and the other letter animations) does not show until the project is opened again.
-- A super is the one clip under a playhead left at the start. So while captions go in and are
-- built, the playhead waits on a frame none of them covers; the returned function puts it back.
local function park_playhead(tl, list, lens, rate, dropFrame)
    local was = try(function() return tl:GetCurrentTimecode() end)
    local function covered(f)
        for i, x in ipairs(list) do
            if f >= x.recordFrame and f < x.recordFrame + lens[i] then return true end
        end
        return false
    end
    local last = try(function() return tl:GetEndFrame() end)
    local spots = { try(function() return tl:GetStartFrame() end) }
    for i, x in ipairs(list) do spots[#spots + 1] = x.recordFrame + lens[i] end
    table.sort(spots)
    local park
    for _, f in ipairs(spots) do
        if not covered(f) and (not last or f <= last) then park = f break end
    end
    park = park or spots[#spots]
    local function go(tc)
        if not try(function() return tl:SetCurrentTimecode(tc) end) then
            try(function() tl:SetCurrentTimecode((tc:gsub(";", ":"))) end)
        end
    end
    if park then go(timecode(park, rate, dropFrame)) end
    return function() if type(was) == "string" and was ~= "" then go(was) end end
end

-- ── Main ───────────────────────────────────────────────────────────────────
-- Places every caption of the job on one timeline. Returns a summary of that timeline.
local function place(job, tl, project, mp, tag)
    local test = job.test or {}
    local sum = { tag = tag, timeline = tl:GetName(), placed = 0, failed = 0, timingOff = 0, keys = 0, keysOff = 0 }
    try(function() rv:OpenPage("edit") end)
    local rateText = tl:GetSetting("timelineFrameRate")
    fps = parse_rate(rateText)
    if not fps then fail("Could not read the timeline frame rate (" .. tostring(rateText) .. ")."); return sum end
    local dropFrame = tostring(tl:GetSetting("timelineDropFrameTimecode")) == "1"
    local tlStart = tl:GetStartFrame()
    sum.fps, sum.dropFrame = rateText, dropFrame
    log("Timeline " .. tl:GetName() .. " · " .. tostring(rateText) .. " fps (" .. string.format("%.6f", fps) .. ")"
        .. (dropFrame and " DF" or "") .. " · starts at frame " .. tlStart .. " = " .. timecode(tlStart, fps, dropFrame))

    -- The Text+ template is only needed for captions the app did not draw
    local anyText = false
    for _, cue in ipairs(job.cues) do if type(cue.render) ~= "table" then anyText = true end end
    local template, tRate = nil, fps
    if anyText then
        template, tRate = template_of(mp, fps)
        if not template then fail("No Text+ template. Reinstall MotionCaption, or drag Effects → Titles → Text+ into the Media Pool."); return sum end
    end
    -- Resolve turns endFrame into floor(endFrame × timeline rate ÷ template rate) frames
    local function end_frame(len)
        if math.abs(tRate - fps) < 0.0001 then return len end
        return math.ceil(len * tRate / fps - 1e-6)
    end

    -- Where the captions go (job.target, from the app's "Put on"):
    --   track = "new" or a video track number; captions that would cover a clip there
    --           go on a new track above instead, so nothing on the timeline is replaced
    --   replace = an update: captions of the last send that are still wanted exactly as
    --           they are stay untouched; the rest of that send is removed, its tracks reused
    local tgt = job.target or {}
    local fixedTrack = type(tgt.track) == "number" and tgt.track <= tl:GetTrackCount("video") and tgt.track or nil
    local targetKey = fixedTrack and ("V " .. tostring(try(function() return tl:GetTrackName("video", fixedTrack) end))) or "new"

    -- This job's captions, in frames
    local wants = {}
    for _, cue in ipairs(job.cues) do
        local s, e = frames(cue.startMs), frames(cue.endMs)
        if e <= s then
            -- Not an error: shorter than a frame cannot be seen at this rate anyway
            result.skipped = (result.skipped or 0) + 1
            log("NOTE  Caption " .. tostring(cue.n) .. " is shorter than one frame, so it was left out.")
        else
            wants[#wants + 1] = { cue = cue, s = s, e = e }
        end
    end

    local projectName = try(function() return project:GetName() end)
    local recPath = record_path(projectName, tl:GetName(), job.trackName)
    local reuse, keptCount, removed = {}, 0, 0
    if tgt.replace and not test.newTimeline then
        local last = load_record(recPath)
        if not last then
            -- A send made when a timeline had one record for every source: it counts only
            -- if it made this source's tracks
            local shared = load_record(record_path(projectName, tl:GetName()))
            if shared and made_by(shared, job.trackName) then last = shared end
        end
        if not last then
            -- A send made before each timeline had its own record
            local old = load_record(LAST_SEND)
            if old and not old.project and made_by(old, job.trackName) then last = old end
        end
        if last and last.timeline == tl:GetName() and type(last.tracks) == "table" then
            -- What the last send made, by track name and first frame
            local prev, ownStarts = {}, {}
            for _, c in ipairs(type(last.clips) == "table" and last.clips or {}) do
                prev[tostring(c.track) .. "|" .. tostring(c.start)] = c
                if c.own then
                    ownStarts[c.track] = ownStarts[c.track] or {}
                    ownStarts[c.track][c.start] = true
                end
            end
            local byStart = {}
            for i, w in ipairs(wants) do
                local st = tlStart + w.s
                byStart[st] = byStart[st] or {}
                table.insert(byStart[st], i)
            end
            -- Captions stay only when they still go to the same place ("Put on" unchanged)
            local sameTarget = last.target == targetKey
            -- The wanted caption a clip already is: same frames, same content. Or nil.
            local function same(it, name)
                if not sameTarget then return nil end
                local st, du = try(function() return it:GetStart() end), try(function() return it:GetDuration() end)
                local was = st and prev[name .. "|" .. st]
                if not was or type(was.sig) ~= "string" or was.sig == "" or was.len ~= du then return nil end
                for _, i in ipairs(byStart[st] or {}) do
                    local w = wants[i]
                    if not w.kept and w.cue.sig == was.sig and w.e - w.s == du then return i end
                end
            end
            -- One track of the last send: clips still wanted as they are stay, the others go.
            -- On a track of your own (mine = false) only the clips that send made are looked at.
            local function sort_out(idx, name, mine)
                local drop, stay = {}, 0
                for _, it in ipairs(objects(try(function() return tl:GetItemListInTrack("video", idx) end))) do
                    local st = try(function() return it:GetStart() end)
                    if mine or (st and ownStarts[name][st]) then
                        local i = (mine or idx == fixedTrack) and same(it, name)
                        if i then wants[i].kept = idx; stay = stay + 1 else drop[#drop + 1] = it end
                    end
                end
                if #drop > 0 then try(function() tl:DeleteClips(drop, false) end) end
                keptCount, removed = keptCount + stay, removed + #drop
                log("OK    V" .. idx .. " " .. name .. ": left " .. stay .. " unchanged captions, removed " .. #drop)
            end
            local isMine = {}
            for _, n in ipairs(last.tracks) do isMine[n] = true end
            for idx = 1, tl:GetTrackCount("video") do
                local name = try(function() return tl:GetTrackName("video", idx) end)
                if name and isMine[name] then
                    sort_out(idx, name, true)
                    reuse[#reuse + 1] = idx
                elseif name and ownStarts[name] then
                    sort_out(idx, name, false)
                end
            end
            -- The same for a record from before records listed their clips
            for _, pl in ipairs(type(last.placed) == "table" and last.placed or {}) do
                for _, it in ipairs(objects(try(function() return tl:GetItemListInTrack("video", pl.track) end))) do
                    if try(function() return it:GetStart() end) == pl.start then try(function() tl:DeleteClips({ it }, false) end) end
                end
            end
        end
    end

    -- Lanes: lane 1 is the chosen track (with the clips already on it), then the last
    -- send's tracks, then new tracks above. Each caption takes the first lane where it covers nothing.
    local lanes, laneOf = {}, {}
    if fixedTrack then
        local busy = {}
        for _, it in ipairs(objects(try(function() return tl:GetItemListInTrack("video", fixedTrack) end))) do
            local st, en = try(function() return it:GetStart() end), try(function() return it:GetEnd() end)
            if st and en then busy[#busy + 1] = { st - tlStart, en - tlStart } end
        end
        lanes[1] = { busy = busy, track = fixedTrack }
        laneOf[fixedTrack] = 1
    end
    for _, idx in ipairs(reuse) do
        if not laneOf[idx] then
            lanes[#lanes + 1] = { busy = {}, track = idx, mine = true }
            laneOf[idx] = #lanes
        end
    end
    local function free(lane, s, e)
        for _, b in ipairs(lane.busy) do if s < b[2] and e > b[1] then return false end end
        return true
    end
    -- Captions that stay hold their place; the others go around them
    for _, w in ipairs(wants) do
        if w.kept then
            w.lane = laneOf[w.kept]
            lanes[w.lane].used = true
            table.insert(lanes[w.lane].busy, { w.s, w.e })
        end
    end
    local infos, cueOf = {}, {}
    for _, w in ipairs(wants) do
        local drawn, why
        if not w.kept and type(w.cue.render) == "table" then
            drawn, why = drawn_item(mp, w.cue.render, rateText)
            if not drawn then
                w.skip = true
                sum.failed = sum.failed + 1
                fail("Caption " .. tostring(w.cue.n) .. ": " .. tostring(why))
            end
        end
        if not w.kept and not w.skip then
            local lane
            for li, ln in ipairs(lanes) do if free(ln, w.s, w.e) then lane = li break end end
            if not lane then lanes[#lanes + 1] = { busy = {}, mine = true }; lane = #lanes end
            lanes[lane].used = true
            table.insert(lanes[lane].busy, { w.s, w.e })
            w.lane = lane
            local info = drawn
                and { mediaPoolItem = drawn, startFrame = 0, endFrame = w.e - w.s, recordFrame = tlStart + w.s }
                or { mediaPoolItem = template, startFrame = 0, endFrame = end_frame(w.e - w.s), recordFrame = tlStart + w.s }
            infos[#infos + 1] = { lane = lane, len = w.e - w.s, info = info, drawn = drawn ~= nil }
            cueOf[#infos] = w.cue
        end
    end
    -- A track for every lane that holds a caption (a track of the last send that is no
    -- longer needed stays as it is, empty)
    local trackOf, names, made, trackName = {}, {}, {}, {}
    local m = 0
    for li, ln in ipairs(lanes) do
        if ln.used then
            local idx, name = ln.track, nil
            if idx and not ln.mine then
                name = try(function() return tl:GetTrackName("video", idx) end) or ""
            else
                m = m + 1
                name = job.trackName .. (m > 1 and (" " .. m) or "")
                if not idx then
                    try(function() tl:AddTrack("video") end)
                    idx = tl:GetTrackCount("video")
                end
                try(function() tl:SetTrackName("video", idx, name) end)
                made[#made + 1] = name
            end
            trackOf[li], names[#names + 1], trackName[li] = idx, "V" .. idx .. " " .. name, name
        end
    end
    -- Resolve stays live while this runs, so an Undo or an edit can take a caption track
    -- away mid-send; every caption after that then has no comp. Says what changed, or nil.
    local function lost_track()
        local now = try(function() return project:GetCurrentTimeline() end)
        if not now or try(function() return now:GetName() end) ~= tl:GetName() then
            return "the open timeline changed to " .. tostring(now and try(function() return now:GetName() end))
        end
        local count = try(function() return tl:GetTrackCount("video") end) or 0
        for li, idx in pairs(trackOf) do
            if idx > count or try(function() return tl:GetTrackName("video", idx) end) ~= trackName[li] then
                return "track V" .. idx .. " " .. trackName[li] .. " was removed or renamed in Resolve"
            end
        end
    end
    sum.tracks, sum.made, sum.kept, sum.removed = names, made, keptCount, removed
    local list, lens = {}, {}
    for i, x in ipairs(infos) do x.info.trackIndex = trackOf[x.lane]; list[i], lens[i] = x.info, x.len end

    local t0 = os.time()
    progress(job.id, "placing", 0, #list)
    -- With nothing changed there is nothing to place: every caption is already there
    local back = #list > 0 and park_playhead(tl, list, lens, fps, dropFrame) or function() end
    local items = {}
    if #list > 0 then
        items = try(function() return mp:AppendToTimeline(list) end) or {}
        if #items ~= #list then fail("Resolve placed " .. #items .. " of " .. #list .. " captions on " .. tl:GetName() .. ".") end
    end
    sum.missing = #list - #items
    if #list > 0 and #items == 0 then back(); return sum end

    -- Drawn clips have one blank frame more than they need. Should Resolve count endFrame
    -- as the last frame (not one past it), each comes in a frame long: put those in again
    -- one frame shorter, at the same place.
    local again, idx = {}, {}
    for i, item in ipairs(items) do
        if infos[i] and infos[i].drawn and try(function() return item:GetDuration() end) == lens[i] + 1 then
            again[#again + 1] = item
            idx[#idx + 1] = i
        end
    end
    if #again > 0 then
        try(function() tl:DeleteClips(again, false) end)
        local redo = {}
        for k, i in ipairs(idx) do
            local x = {}
            for kk, v in pairs(list[i]) do x[kk] = v end
            x.endFrame = x.endFrame - 1
            redo[k] = x
        end
        local got = try(function() return mp:AppendToTimeline(redo) end) or {}
        for k, i in ipairs(idx) do items[i] = got[k] end
        log("NOTE  " .. #again .. " drawn captions came in a frame long; placed " .. #got .. " of them again one frame shorter")
        if #got < #again then
            fail("Resolve placed " .. (#list - #again + #got) .. " of " .. #list .. " captions on " .. tl:GetName() .. ".")
            sum.missing = #again - #got
            local packed, cues2, infos2, lens2 = {}, {}, {}, {}
            for i = 1, #list do
                if items[i] then packed[#packed + 1] = items[i]; cues2[#packed] = cueOf[i]; infos2[#packed] = infos[i]; lens2[#packed] = lens[i] end
            end
            items, cueOf, infos, lens = packed, cues2, infos2, lens2
        end
    end

    -- Each caption must start and last exactly as asked, at any frame rate
    for i, item in ipairs(items) do
        local want = list[i]
        local st, du = try(function() return item:GetStart() end), try(function() return item:GetDuration() end)
        if st ~= want.recordFrame or du ~= lens[i] then
            sum.timingOff = sum.timingOff + 1
            if sum.timingOff <= 5 then
                log(string.format("TIME  #%s wanted start %d len %d, got start %s len %s", tostring(cueOf[i].n),
                    want.recordFrame, lens[i], tostring(st), tostring(du)))
            end
        end
    end
    if sum.timingOff > 0 then fail(sum.timingOff .. " captions on " .. tl:GetName() .. " are not at their exact frames.") end

    local step = math.max(1, math.floor(#items / 50))
    local built = {}
    for i, item in ipairs(items) do
        local cue = cueOf[i]
        if i == 1 or i % step == 0 then progress(job.id, "animating", i - 1, #items) end
        probes = {}
        -- A drawn caption is finished once it is placed; a Text+ one gets its look and animation now
        local ok, err = true, nil
        if infos[i] and infos[i].drawn then sum.drawn = (sum.drawn or 0) + 1 else ok, err = pcall(build, item, cue) end
        if i == 1 and test.probe then
            local comp = try(function() return item:GetFusionCompByIndex(1) end)
            local at = comp and try(function() return comp:GetAttrs() end) or {}
            -- Every Text+ input with its name and value, for mapping the Inspector to Resolve
            local tp = comp and comp:FindTool("Template")
            if tp then
                local out = {}
                for _, inp in ipairs(objects(try(function() return tp:GetInputList() end))) do
                    local a = try(function() return inp:GetAttrs() end) or {}
                    local val = try(function() return tp:GetInput(a.INPS_ID) end)
                    if type(val) == "table" then val = "{" .. tostring(val[1]) .. ", " .. tostring(val[2]) .. "}" end
                    out[#out + 1] = string.format("%-34s %-30s %-22s %s", tostring(a.INPS_ID), tostring(a.INPS_Name), tostring(a.INPID_InputControl), tostring(val))
                end
                table.sort(out)
                write_file(BASE .. "textplus_inputs.txt", table.concat(out, "\n") .. "\n")
                log("      Text+ inputs: " .. #out .. " → textplus_inputs.txt")
            end
            log(string.format("      Comp of #%s: frames %s–%s, caption %s frames", tostring(cue.n),
                tostring(at.COMPN_GlobalStart), tostring(at.COMPN_GlobalEnd), tostring(item:GetDuration())))
        end
        if test.probe and i <= 4 then
            local comp = try(function() return item:GetFusionCompByIndex(1) end)
            local tp = comp and comp:FindTool("Template")
            if tp then
                local vals = {}
                for _, id in ipairs({ "Enabled2", "ElementShape2", "Thickness2", "Red2", "Enabled3", "Offset3", "SoftnessX3", "Opacity3",
                    "Enabled4", "ElementShape4", "Level4", "Opacity4", "ExtendHorizontal4", "Round4", "HorizontallyJustified", "LineSpacing" }) do
                    local v = try(function() return tp:GetInput(id) end)
                    if type(v) == "table" then v = string.format("{%.3f, %.3f}", v[1] or 0, v[2] or 0) end
                    vals[#vals + 1] = id .. "=" .. tostring(v)
                end
                log("      #" .. tostring(cue.n) .. " looks: " .. table.concat(vals, " "))
            end
        end
        if test.probe then
            for _, p in ipairs(probes) do
                local n, bad = check_keys(p, cue.n)
                sum.keys, sum.keysOff = sum.keys + n, sum.keysOff + bad
            end
        end
        local gone = not ok and lost_track()
        if gone then
            -- One clear message instead of the same error for every caption that is left
            local left = #items - i + 1
            sum.failed = sum.failed + left
            fail(string.format("Stopped at caption %s: %s while the captions were going in, so the last %d could not be made."
                .. " Send again, and leave Resolve alone (no Undo or edits) until Send finishes.", tostring(cue.n), gone, left))
            break
        elseif ok then
            sum.placed = sum.placed + 1
            built[i] = true
        else
            sum.failed = sum.failed + 1
            fail("Caption " .. tostring(cue.n) .. ": " .. tostring(err))
        end
    end
    log(string.format("Placed %d captions on %s in ~%d s", sum.placed, table.concat(names, ", "), os.time() - t0)
        .. (keptCount > 0 and (" · " .. keptCount .. " unchanged captions left as they were") or ""))
    back()
    if test.probe then
        log(string.format("Keys on their frames: %d of %d", sum.keys - sum.keysOff, sum.keys))
        if sum.keysOff > 0 then fail(sum.keysOff .. " keys on " .. tl:GetName() .. " are off their frame or value.") end
    end

    -- Remember what this send made, for the next send's replace; turn the subtitles off
    if not test.newTimeline and (sum.placed > 0 or keptCount > 0) then
        local q, clips = {}, {}
        for _, n in ipairs(sum.made or {}) do q[#q + 1] = string.format("%q", n) end
        local function clip(lane, start, len, sig)
            clips[#clips + 1] = string.format("  { track = %q, start = %d, len = %d, sig = %q%s }", trackName[lane], start, len,
                tostring(sig or ""), lanes[lane].mine and "" or ", own = true")
        end
        for _, w in ipairs(wants) do
            if w.kept then clip(w.lane, tlStart + w.s, w.e - w.s, w.cue.sig) end
        end
        -- A caption whose animation failed is listed with no signature, so the next send redoes it
        for i, item in ipairs(items) do
            local st, du = try(function() return item:GetStart() end), try(function() return item:GetDuration() end)
            if st and du then clip(infos[i].lane, st, du, built[i] and cueOf[i].sig or "") end
        end
        write_file(recPath, string.format("return { project = %q, timeline = %q, target = %q, tracks = { %s }, clips = {\n%s\n} }\n",
            tostring(try(function() return project:GetName() end)), tl:GetName(), targetKey, table.concat(q, ", "), table.concat(clips, ",\n")))
        if type(tgt.disableSubtitle) == "number" then
            local off = try(function() return tl:SetTrackEnable("subtitle", tgt.disableSubtitle, false) end)
            log((off and "OK    " or "WARN  ") .. "Subtitle track " .. tgt.disableSubtitle .. " turned off → " .. tostring(off))
        end
        -- Text+ layers the captions were made from: turned off (never deleted), so the
        -- words do not show twice. Each is found by its track and first frame.
        if type(tgt.disableClips) == "table" and #tgt.disableClips > 0 then
            local byTrack, off, missing = {}, 0, 0
            for _, c in ipairs(tgt.disableClips) do
                if not byTrack[c.track] then
                    byTrack[c.track] = {}
                    for _, it in ipairs(objects(try(function() return tl:GetItemListInTrack("video", c.track) end))) do
                        local st = try(function() return it:GetStart() end)
                        if st then byTrack[c.track][st] = it end
                    end
                end
                local it = byTrack[c.track][c.at]
                if it and try(function() return it:SetClipEnabled(false) end) then off = off + 1 else missing = missing + 1 end
            end
            log((missing == 0 and "OK    " or "WARN  ") .. "Turned off " .. off .. " of " .. #tgt.disableClips .. " Text+ layers the captions came from")
            if missing > 0 then fail(missing .. " Text+ layers could not be turned off. They were moved or are on a locked track; turn them off by hand.") end
        end
    end

    -- Test runs: still frames, so the look can be checked from images
    if test.stills then
        local byN = {}
        for i, item in ipairs(items) do byN[cueOf[i].n] = item end
        local saved = 0
        for _, st in ipairs(test.stills) do
            local item = byN[st.n]
            if item and try(function() return item:GetStart() end) then
                local tc = timecode(item:GetStart() + frames(st.ms), fps, dropFrame)
                if not try(function() return tl:SetCurrentTimecode(tc) end) then
                    try(function() tl:SetCurrentTimecode((tc:gsub(";", ":"))) end)
                end
                local t = os.clock() + 0.4
                while os.clock() < t do end
                local p = BASE .. "stills\\" .. (tag and (tag .. "_") or "") .. "c" .. st.n .. "_" .. st.ms .. ".jpg"
                os.remove(p)
                try(function() project:ExportCurrentFrameAsStill(p) end)
                if read_file(p) then saved = saved + 1 end
            end
        end
        log("Stills saved: " .. saved .. " of " .. #test.stills .. " → " .. BASE .. "stills\\")
    end
    return sum
end

-- ── Timeline for the app ───────────────────────────────────────────────────
-- Text+ inputs the app turns back into its own look (core/layers.ts), so a layer you made
-- keeps its font, size, colour and place when MotionCaption animates it
local LAYER_INPUTS = { "Font", "Style", "Size", "CharacterSpacing", "LineSpacing", "Red1", "Green1", "Blue1", "Center",
    "HorizontalJustificationNew", "AngleZ",
    "Enabled2", "Thickness2", "Red2", "Green2", "Blue2",
    "Enabled3", "Red3", "Green3", "Blue3", "Opacity3", "SoftnessX3", "Offset3",
    "Enabled4", "Red4", "Green4", "Blue4", "Opacity4", "Round4", "ExtendHorizontal4" }

-- A video clip's Text+: the text and look of its longest Text+ (Text+ titles, and Fusion
-- titles built on Text+). Clips with no Fusion comp (footage, Edit page "Text") give nil.
local function text_of(it)
    if (try(function() return it:GetFusionCompCount() end) or 0) < 1 then return nil end
    local comp = try(function() return it:GetFusionCompByIndex(1) end)
    if not comp then return nil end
    local tools = objects(try(function() return comp:GetToolList(false, "TextPlus") end))
    local best, text
    for _, t in ipairs(tools) do
        local s = try(function() return t:GetInput("StyledText") end)
        if type(s) == "string" and s:find("%S") and (not text or #s > #text) then best, text = t, s end
    end
    if not best then return nil end
    local raw = {}
    for _, id in ipairs(LAYER_INPUTS) do
        local v = try(function() return best:GetInput(id) end)
        if type(v) == "table" then v = { tonumber(v[1]) or 0, tonumber(v[2]) or 0 } end
        if type(v) == "number" or type(v) == "string" or type(v) == "table" then raw[id] = v end
    end
    -- Text+ keeps line breaks as \r
    return (text:gsub("\r\n", "\n"):gsub("\r", "\n")), raw, #tools
end

-- The app cannot ask Resolve anything, so every click writes what it needs: the open
-- timeline's size, rate, video tracks, every subtitle, and every Text+ layer (text,
-- start, end in ms from the timeline's start).
local function read_timeline()
    local project = rv and rv:GetProjectManager():GetCurrentProject()
    local tl = project and project:GetCurrentTimeline()
    if not tl then
        write_file(TIMELINE, json({ readAt = os.date("%Y-%m-%dT%H:%M:%S"), project = project and project:GetName() or nil, timeline = false }))
        return
    end
    local rate = parse_rate(tl:GetSetting("timelineFrameRate")) or 24
    local start = tl:GetStartFrame()
    local ms = function(f) return math.floor((f - start) * 1000000 / rate + 0.5) / 1000 end
    local T = {
        readAt = os.date("%Y-%m-%dT%H:%M:%S"), project = project:GetName(),
        timeline = { name = tl:GetName(), fps = tostring(tl:GetSetting("timelineFrameRate")), rate = rate,
            dropFrame = tostring(tl:GetSetting("timelineDropFrameTimecode")) == "1",
            width = tonumber(tl:GetSetting("timelineResolutionWidth")), height = tonumber(tl:GetSetting("timelineResolutionHeight")),
            -- The whole timeline's length in ms, as Resolve shows it
            length = (function() local e = try(function() return tl:GetEndFrame() end); return e and ms(e) or nil end)() },
        video = {}, subtitle = {}, texts = {},
    }
    local looked, t0 = 0, os.clock()
    for i = 1, (tl:GetTrackCount("video") or 0) do
        local items = objects(try(function() return tl:GetItemListInTrack("video", i) end))
        local trackName = try(function() return tl:GetTrackName("video", i) end) or ("Video " .. i)
        local clips = {}
        for j, it in ipairs(items) do
            if j > 400 then break end
            local st, en = try(function() return it:GetStart() end), try(function() return it:GetEnd() end)
            if st and en then
                local name = try(function() return it:GetName() end) or ""
                clips[#clips + 1] = { start = ms(st), ["end"] = ms(en), name = name }
                -- Opening a comp takes a moment, so at most 300 layers per read
                if looked < 300 then
                    local text, raw, n = text_of(it)
                    if text then
                        looked = looked + 1
                        T.texts[#T.texts + 1] = { track = i, at = st, start = ms(st), ["end"] = ms(en), text = text, name = name,
                            enabled = try(function() return it:GetClipEnabled() end) ~= false,
                            -- Captions MotionCaption placed itself (its tracks are named "MC …")
                            mc = trackName:sub(1, 3) == "MC ", tools = n, raw = raw }
                    end
                end
            end
        end
        T.video[#T.video + 1] = { index = i, name = trackName,
            enabled = try(function() return tl:GetIsTrackEnabled("video", i) end) ~= false, clips = clips }
    end
    log(string.format("Text+ layers: %d (%.1f s)", #T.texts, os.clock() - t0))
    for i = 1, (tl:GetTrackCount("subtitle") or 0) do
        local cues = {}
        for _, it in ipairs(objects(try(function() return tl:GetItemListInTrack("subtitle", i) end))) do
            local st, en = try(function() return it:GetStart() end), try(function() return it:GetEnd() end)
            if st and en then cues[#cues + 1] = { start = ms(st), ["end"] = ms(en), text = try(function() return it:GetName() end) or "" } end
        end
        table.sort(cues, function(a, b) return a.start < b.start end)
        T.subtitle[#T.subtitle + 1] = { index = i, name = try(function() return tl:GetTrackName("subtitle", i) end) or ("Subtitle " .. i),
            enabled = try(function() return tl:GetIsTrackEnabled("subtitle", i) end) ~= false, cues = cues }
    end
    write_file(TIMELINE, json(T))
    log("Read timeline " .. T.timeline.name .. ": " .. #T.video .. " video, " .. #T.subtitle .. " subtitle tracks")
end

-- Seconds since the app made this job: its id starts with the UTC time of the Send
-- (core/job.ts). 0 when the id does not say, so an unknown job counts as just sent.
local function job_age(job)
    local y, mo, d, h, mi, s = tostring(job.id):match("^(%d%d%d%d)(%d%d)(%d%d)(%d%d)(%d%d)(%d%d)")
    if not y then return 0 end
    local sent = os.time({ year = tonumber(y), month = tonumber(mo), day = tonumber(d),
        hour = tonumber(h), min = tonumber(mi), sec = tonumber(s), isdst = false })
    local now = os.date("!*t")
    now.isdst = false
    return os.difftime(os.time(now), sent)
end

-- Resolve keeps drawing a clip the way it first drew it. A caption placed where a clip was
-- drawn before (an update of a super), or drawn before build() added its Follower, plays
-- without its letter animation until the project is opened again. Opening another timeline
-- and coming back makes Resolve draw this one again, as a restart does. With no other
-- timeline in the project, an empty one is made for the moment and deleted again.
local function redraw(project, mp, tl)
    local name = try(function() return tl:GetName() end)
    local other
    for i = 1, (try(function() return project:GetTimelineCount() end) or 0) do
        local t = try(function() return project:GetTimelineByIndex(i) end)
        if t and try(function() return t:GetName() end) ~= name then other = t break end
    end
    local temp
    if not other then
        temp = try(function() return mp:CreateEmptyTimeline("MC redraw " .. os.date("%H%M%S")) end)
        other = temp
    end
    if not other then log("NOTE  Could not open another timeline to redraw " .. tostring(name)); return end
    local otherName = try(function() return other:GetName() end)
    try(function() return project:SetCurrentTimeline(other) end)
    try(function() return project:SetCurrentTimeline(tl) end)
    local now = try(function() return project:GetCurrentTimeline():GetName() end)
    if now ~= name then try(function() return project:SetCurrentTimeline(tl) end) end
    local gone = temp and try(function() return mp:DeleteTimelines({ temp }) end)
    log(string.format("OK    Redrew %s: opened %s and came back%s", tostring(name),
        temp and "an empty timeline" or ("“" .. tostring(otherName) .. "”"),
        temp and (gone and ", then deleted it" or (", but could not delete “" .. tostring(otherName) .. "”")) or ""))
end

local function main()
    if not rv then fail("This scripting host has no Resolve object."); return end
    local job, jerr = load_job()
    if not job then
        -- No file at all is the normal first run; a broken one is a real problem
        if not read_file(JOB) then idle = true; return end
        fail(jerr); return
    end
    result.jobId = job.id
    log("Job " .. job.id .. " · " .. tostring(job.source) .. " · " .. #job.cues .. " captions")

    local test = job.test or {}
    -- A job that already went in is done: the click opens the app instead. A test job runs
    -- once, whatever its result: one left behind used to run again on every click, making a
    -- new test timeline each time, and when it failed the click opened the log, never the app.
    -- A real Send that failed still runs again, so a second click can finish it.
    local prev = read_file(RESULT)
    if prev and prev:find('"jobId":' .. json(job.id), 1, true) and (prev:find('"ok":true', 1, true) or job.test) then
        log(job.test and "This test already ran (its result is in result.json). Opening MotionCaption."
            or "These captions are already in Resolve. Opening MotionCaption.")
        idle = true
        return
    end
    progress(job.id, "starting", 0, #job.cues)

    local project = rv:GetProjectManager():GetCurrentProject()
    if not project then fail("Open a project first."); return end
    local mp = project:GetMediaPool()


    -- Test runs: read the open timeline first (as a click with no job would), and check a
    -- subtitle track can be turned off and back on
    if test.newTimeline then
        result.test = true -- the timeline read below stays: the test timeline is not the user's
        try(read_timeline)
        local mine = project:GetCurrentTimeline()
        if test.toggle and mine and (mine:GetTrackCount("subtitle") or 0) > 0 then
            local before = mine:GetIsTrackEnabled("subtitle", 1)
            local off = try(function() return mine:SetTrackEnable("subtitle", 1, false) end)
            local mid = try(function() return mine:GetIsTrackEnabled("subtitle", 1) end)
            local back = try(function() return mine:SetTrackEnable("subtitle", 1, before) end)
            log(string.format("      Toggle ST1 on %s: was %s, off → %s (reads %s), back → %s (reads %s)", mine:GetName(), tostring(before),
                tostring(off), tostring(mid), tostring(back), tostring(try(function() return mine:GetIsTrackEnabled("subtitle", 1) end))))
        end
    end

    -- Test runs at several frame rates: one new timeline per rate
    if test.newTimeline and test.frameRates then
        result.rates = {}
        local stamp = os.date("%H%M%S")
        for _, rate in ipairs(test.frameRates) do
            local tag = rate.rate:gsub("%.", "") .. (rate.dropFrame and "DF" or "")
            log("")
            log("── " .. rate.rate .. (rate.dropFrame and " DF" or "") .. " fps")
            local tl, err = new_timeline(mp, project, test.newTimeline .. "_" .. tag .. "_" .. stamp, rate)
            if tl then
                local sum = place(job, tl, project, mp, tag)
                result.rates[#result.rates + 1] = sum
                result.placed, result.failed = result.placed + sum.placed, result.failed + sum.failed
            else
                fail(err)
                result.rates[#result.rates + 1] = { tag = tag, error = err }
            end
        end
        log("")
        log("── Summary")
        for _, s in ipairs(result.rates) do
            if s.error then log(string.format("%-8s %s", s.tag, s.error))
            else
                log(string.format("%-8s placed %d/%d · timing off %d · keys off %d of %d", s.tag, s.placed,
                    #job.cues, s.timingOff, s.keysOff, s.keys))
            end
        end
        result.ok = #result.errors == 0
        return
    end

    local tl
    if test.newTimeline then
        tl = new_timeline(mp, project, test.newTimeline .. "_" .. os.date("%H%M%S"))
        if tl and test.size then
            try(function() tl:SetSetting("useCustomSettings", "1") end)
            try(function() tl:SetSetting("timelineResolutionWidth", tostring(test.size.width)) end)
            try(function() tl:SetSetting("timelineResolutionHeight", tostring(test.size.height)) end)
            log("      Test timeline size " .. tostring(tl:GetSetting("timelineResolutionWidth")) .. "x" .. tostring(tl:GetSetting("timelineResolutionHeight")))
        end
    else
        tl = project:GetCurrentTimeline()
    end
    if not tl then fail("Open the timeline the captions are for, then run MotionCaption again."); return end
    -- Captions go on the timeline they were made for, whichever one is open now
    if job.project and not test.newTimeline and job.project ~= project:GetName() then
        -- A Send just made waits for this click, so it hears why nothing came in. A job left
        -- from earlier, for another project, must not stop this project's click: open the app.
        if job_age(job) > 120 then
            log("NOTE  The waiting captions are for the project “" .. job.project .. "”. Opening MotionCaption for “"
                .. project:GetName() .. "” instead.")
            idle = true
            return
        end
        fail("These captions are for the project “" .. job.project .. "”, but “" .. project:GetName() .. "” is open. Open it, then Send again.")
        return
    end
    if job.timeline and not test.newTimeline and job.timeline ~= tl:GetName() then
        local want
        for i = 1, (project:GetTimelineCount() or 0) do
            local t = try(function() return project:GetTimelineByIndex(i) end)
            if t and t:GetName() == job.timeline then want = t break end
        end
        if not want then
            fail("The timeline “" .. job.timeline .. "” is not in this project any more.")
            return
        end
        project:SetCurrentTimeline(want)
        tl = want
        log("OK    Switched to the timeline “" .. job.timeline .. "” the captions were made for")
    end
    local sum = place(job, tl, project, mp)
    -- Only Text+ captions can show a stale first drawing; drawn ones are plain clips
    if sum.placed > (sum.drawn or 0) then try(function() redraw(project, mp, tl) end) end
    result.timeline, result.fps, result.tracks = sum.timeline, fps, sum.tracks
    result.placed, result.failed = sum.placed, sum.failed
    result.kept, result.removed = sum.kept or 0, sum.removed or 0
    result.ok = sum.failed == 0 and (sum.missing or 1) == 0 and (sum.timingOff or 0) == 0
end

-- ── Running ────────────────────────────────────────────────────────────────
local function reset()
    result = { ok = false, placed = 0, failed = 0, errors = {} }
    lines, probes, idle = {}, {}, false
end

-- One pass: place the waiting job, or with none, read the timeline. True when idle.
local function run_once()
    local ok, err = pcall(main)
    if not ok then fail("Stopped early: " .. tostring(err)) end
    if idle or ((result.placed > 0 or (result.kept or 0) > 0 or (result.removed or 0) > 0) and not result.test) then try(read_timeline) end
    -- With nothing to place, result.json stays as it was: it still says the last job is
    -- in Resolve, so a second click can never place the same captions twice
    if idle and #result.errors == 0 then return true end
    result.finishedAt = os.date("%Y-%m-%dT%H:%M:%S")
    log(result.ok and "Done." or "Finished with problems. Details above.")
    write_file(RESULT, json(result))
    write_file(LOG, table.concat(lines, "\n") .. "\n")
    return false
end

local function job_id()
    local f = io.open(JOB, "rb")
    if not f then return nil end
    local head = f:read(600) or ""
    f:close()
    return head:match('id = "([^"]+)"')
end

local function link_alive()
    local at = tonumber((read_file(LINK) or ""):match('"at":(%d+)'))
    return at ~= nil and os.time() - at <= 3
end

local function app_or_log()
    if not open_app() then
        log("MotionCaption Studio was not found. Install it again, then open it from the Start menu.")
        write_file(LOG, table.concat(lines, "\n") .. "\n")
        pcall(function() bmd.openfileexternal("Open", LOG) end)
    end
end

-- "DaVinci Resolve Studio" or "DaVinci Resolve". Anything unreadable counts as Free, so a
-- Studio-only call is never made by mistake.
local function is_studio()
    local name = try(function() return rv:GetProductName() end)
    return type(name) == "string" and name:find("Studio", 1, true) ~= nil
end

-- The Link window (Studio only): stays open inside Resolve and does each Send from the app
-- as it comes, so the app needs no second click. Closing it goes back to one click per Send.
local function link()
    -- Resolve Free has no UIManager (Studio only since 19.1), and just reaching for it
    -- makes Resolve show its "You have reached a limitation" box on every click and every
    -- Send. So Free never touches it: the app runs this script through Resolve's menu for
    -- each Send instead.
    if not is_studio() then return end
    -- Resolve's script host may not set fusion/fu; Resolve itself can hand its Fusion over
    local fu_ = fusion or fu or try(function() return rv:Fusion() end)
    local ui = fu_ and try(function() return fu_.UIManager end)
    if not ui or not bmd or not bmd.UIDispatcher then return end
    local disp = bmd.UIDispatcher(ui)
    local win = disp:AddWindow({ ID = "MCLink", WindowTitle = "MotionCaption", Geometry = { 80, 120, 380, 150 } }, ui:VGroup({
        ui:Label({ ID = "Status", Text = "Connected. Press Send in MotionCaption Studio and the captions come in here.", WordWrap = true }),
        ui:Label({ ID = "Last", Text = "", WordWrap = true }),
        ui:HGroup({
            ui:Button({ ID = "Open", Text = "Open app" }),
            ui:Button({ ID = "Read", Text = "Read timeline" }),
            ui:Button({ ID = "Stop", Text = "Disconnect" }),
        }),
    }))
    if not win then log("NOTE  The Link window could not open."); return end
    local items = win:GetItems()
    local lastJob, lastRefresh = job_id(), read_file(REFRESH)
    local function tlName()
        local p = rv:GetProjectManager():GetCurrentProject()
        local t = p and p:GetCurrentTimeline()
        return t and t:GetName() or ""
    end
    local lastTl = tlName()
    local busy, lastTick = false, -1
    local function beat() write_file(LINK, json({ at = os.time(), timeline = lastTl })) end

    local function tick()
        if busy or os.clock() - lastTick < 0.2 then return end
        busy, lastTick = true, os.clock()
        pcall(function()
            beat()
            local id = job_id()
            if id and id ~= lastJob then
                lastJob = id
                items.Status.Text = "Placing captions…"
                reset()
                run_once()
                items.Status.Text = result.ok
                    and ("Placed " .. result.placed .. " captions on " .. table.concat(result.tracks or {}, ", ") .. " in " .. tostring(result.timeline) .. ".")
                    or ("Could not place them: " .. tostring(result.errors[1] or "see bridge.log"))
                items.Last.Text = os.date("%H:%M") .. " · waiting for the next Send"
                lastTl = tlName()
            end
            local r = read_file(REFRESH)
            local now = tlName()
            if r ~= lastRefresh or now ~= lastTl then
                lastRefresh, lastTl = r, now
                lines = {}
                try(read_timeline)
                items.Last.Text = os.date("%H:%M") .. " · read “" .. now .. "”"
            end
        end)
        busy = false
    end

    -- UI Manager timers report through the dispatcher; both forms are tried, tick() skips repeats
    local timer = try(function() return ui:Timer({ ID = "MCTick", Interval = 500 }) end)
    try(function() function disp.On.Timeout(ev) tick() end end)
    try(function() function win.On.MCTick.Timeout(ev) tick() end end)
    function win.On.MCLink.Close(ev) disp:ExitLoop() end
    function win.On.Stop.Clicked(ev) disp:ExitLoop() end
    function win.On.Open.Clicked(ev) open_app() end
    function win.On.Read.Clicked(ev)
        lines = {}
        try(read_timeline)
        items.Last.Text = os.date("%H:%M") .. " · read “" .. tlName() .. "”"
    end

    beat()
    win:Show()
    if timer then try(function() timer:Start() end) end
    disp:RunLoop()
    if timer then try(function() timer:Stop() end) end
    win:Hide()
    write_file(LINK, json({ at = 0 }))
end

-- A Link window is already open: it does the Sends. Ask it for a fresh read, show the app.
if link_alive() then
    write_file(REFRESH, os.date("%Y-%m-%dT%H:%M:%S"))
    open_app()
    return
end

reset()
local wasIdle = run_once()
local job = try(load_job)
if wasIdle then
    app_or_log()
elseif not result.ok or (job and job.test and job.test.openLog) then
    pcall(function() bmd.openfileexternal("Open", LOG) end)
end
if not (job and job.test) then
    local ok, err = pcall(link)
    if not ok then write_file(BASE .. "link_error.txt", "error · " .. tostring(err) .. "\n") end
end
