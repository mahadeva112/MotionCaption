-- MotionCaption · Spike 6  (Workspace -> Scripts -> MotionCaption_Spike6)
--
-- Checks what the Timeline Studio (mockup D) needs from Resolve, in one run:
--   1. subtitle tracks on the open timeline can be read: text, start and end
--   2. a subtitle track can be turned off and back on
--   3. Text+ shading elements: outline, shadow, box behind the text, and a box behind
--      one word only (an overlay copy whose Follower shows just that word)
--   4. alignment, line spacing, character spacing, Text+ rotation
-- Writes %APPDATA%\MotionCaption\spike6.json, spike6_inputs.txt and stills\s6_*.jpg.
-- It makes a scratch timeline, deletes it at the end and goes back to your timeline.
-- Your timeline is only read; the subtitle track is switched back to how it was.

local BASE = (os.getenv("APPDATA") or os.getenv("TEMP") or ".") .. "\\MotionCaption\\"
local lines, R = {}, { checks = {} }

local function log(s) s = tostring(s); lines[#lines + 1] = s; print("[MotionCaption] " .. s) end
local function try(fn) local ok, a = pcall(fn); if ok then return a end; return nil, a end
local function objects(t)
    local out = {}
    for k, v in pairs(t or {}) do
        if type(v) == "userdata" then out[#out + 1] = v elseif type(k) == "userdata" then out[#out + 1] = k end
    end
    return out
end
local function write_file(p, s) local f = io.open(p, "wb"); if not f then return false end; f:write(s); f:close(); return true end
local function exists(p) local f = io.open(p, "rb"); if f then f:close(); return true end; return false end

local function json(v, depth)
    depth = depth or 0
    local t = type(v)
    if t == "nil" or depth > 6 then return "null" end
    if t == "boolean" then return tostring(v) end
    if t == "number" then if v ~= v or v == math.huge or v == -math.huge then return "null" end; return tostring(v) end
    if t == "string" then
        return '"' .. v:gsub('[%c"\\]', function(c)
            local map = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
            return map[c] or string.format("\\u%04x", c:byte())
        end) .. '"'
    end
    if t ~= "table" then return json(tostring(v)) end
    local parts = {}
    if #v > 0 or next(v) == nil then
        for _, x in ipairs(v) do parts[#parts + 1] = json(x, depth + 1) end
        return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, x in pairs(v) do parts[#parts + 1] = json(tostring(k), depth + 1) .. ":" .. json(x, depth + 1) end
    return "{" .. table.concat(parts, ",") .. "}"
end

local function driver(tool, input)
    local o = try(function() return tool[input]:GetConnectedOutput() end)
    return o and o:GetTool()
end

local rv = resolve or (fusion and fusion:GetResolve())
if not rv then print("[MotionCaption] This scripting host has no Resolve object.") return end
R.resolve = try(function() return rv:GetVersionString() end)
log("MotionCaption Spike 6 · " .. os.date("%Y-%m-%d %H:%M:%S") .. " · Resolve " .. tostring(R.resolve))

local project = rv:GetProjectManager():GetCurrentProject()
if not project then log("FAIL  Open a project first.") return end
local mp = project:GetMediaPool()
local mine = project:GetCurrentTimeline()

-- ── 1. Read the open timeline ─────────────────────────────────────────────
local function read_timeline(tl)
    local T = {
        name = tl:GetName(), fps = tl:GetSetting("timelineFrameRate"),
        width = tl:GetSetting("timelineResolutionWidth"), height = tl:GetSetting("timelineResolutionHeight"),
        df = tl:GetSetting("timelineDropFrameTimecode"), start = tl:GetStartFrame(), ["end"] = tl:GetEndFrame(),
        video = {}, subtitle = {},
    }
    for i = 1, (tl:GetTrackCount("video") or 0) do
        local items = objects(try(function() return tl:GetItemListInTrack("video", i) end))
        T.video[#T.video + 1] = { index = i, name = try(function() return tl:GetTrackName("video", i) end),
            enabled = try(function() return tl:GetIsTrackEnabled("video", i) end), count = #items }
    end
    for i = 1, (tl:GetTrackCount("subtitle") or 0) do
        local t0 = os.clock()
        local items = objects(try(function() return tl:GetItemListInTrack("subtitle", i) end))
        local s = { index = i, name = try(function() return tl:GetTrackName("subtitle", i) end),
            enabled = try(function() return tl:GetIsTrackEnabled("subtitle", i) end), count = #items, samples = {} }
        -- Read every item the way the bridge would, and time it
        local texts = 0
        for j, it in ipairs(items) do
            local name = try(function() return it:GetName() end)
            if name and name ~= "" then texts = texts + 1 end
            if j <= 4 then
                local smp = { name = name, start = try(function() return it:GetStart() end), ["end"] = try(function() return it:GetEnd() end),
                    duration = try(function() return it:GetDuration() end) }
                if j == 1 then
                    local props = try(function() return it:GetProperty() end)
                    smp.props = {}
                    if type(props) == "table" then for k, v in pairs(props) do smp.props[tostring(k)] = tostring(v) end end
                    smp.uid = try(function() return it:GetUniqueId() end)
                end
                s.samples[#s.samples + 1] = smp
            end
        end
        s.withText, s.readMs = texts, math.floor((os.clock() - t0) * 1000)
        T.subtitle[#T.subtitle + 1] = s
    end
    return T
end

if mine then
    R.timeline = read_timeline(mine)
    log(string.format("Timeline %s · %s fps · %sx%s · %d video, %d subtitle tracks", R.timeline.name, tostring(R.timeline.fps),
        tostring(R.timeline.width), tostring(R.timeline.height), #R.timeline.video, #R.timeline.subtitle))
    for _, s in ipairs(R.timeline.subtitle) do
        log(string.format("  ST%d %s: %d items, %d with text, read in %d ms; first: %s", s.index, tostring(s.name), s.count,
            s.withText, s.readMs, s.samples[1] and tostring(s.samples[1].name) or "-"))
    end
    -- ── 2. Turn subtitle track 1 off and back on ──
    if #R.timeline.subtitle > 0 then
        local before = mine:GetIsTrackEnabled("subtitle", 1)
        local off = try(function() return mine:SetTrackEnable("subtitle", 1, false) end)
        local mid = try(function() return mine:GetIsTrackEnabled("subtitle", 1) end)
        local back = try(function() return mine:SetTrackEnable("subtitle", 1, before) end)
        local after = try(function() return mine:GetIsTrackEnabled("subtitle", 1) end)
        R.checks.toggle = { before = before, setOff = off, whileOff = mid, setBack = back, after = after }
        log(string.format("  Toggle ST1: was %s, off → %s (reads %s), back → %s (reads %s)", tostring(before), tostring(off),
            tostring(mid), tostring(back), tostring(after)))
    else
        log("  No subtitle track on this timeline, so reading and toggling were not tested.")
    end
else
    log("WARN  No timeline open: subtitle reading was not tested.")
end

-- ── 3/4. Text+ looks, on a scratch timeline ───────────────────────────────
local function is_title(c) return tostring(try(function() return c:GetClipProperty("Type") end)):match("Fusion Title") ~= nil end
local function find_title(folder, depth)
    if not folder or depth > 3 then return nil end
    for _, c in ipairs(objects(try(function() return folder:GetClipList() end))) do if is_title(c) then return c end end
    for _, sub in ipairs(objects(try(function() return folder:GetSubFolderList() end))) do
        local c = find_title(sub, depth + 1); if c then return c end
    end
end
local template = find_title(mp:GetRootFolder(), 0)
if not template and exists(BASE .. "templates\\Template_24.drb") then
    try(function() mp:ImportFolderFromFile(BASE .. "templates\\Template_24.drb") end)
    template = find_title(mp:GetRootFolder(), 0)
end

-- Each variant: name, text, and inputs to set on the caption's Text+
local TEXT = "Every moment is a possibility"
local VARIANTS = {
    { "plain", TEXT, {} },
    { "outline", TEXT, { Enabled2 = 1, Thickness2 = 0.08, Red2 = 0, Green2 = 0, Blue2 = 0, Opacity2 = 1 } },
    { "shadow", TEXT, { Enabled3 = 1, Red3 = 0, Green3 = 0, Blue3 = 0, Opacity3 = 0.8, SoftnessX3 = 8, SoftnessY3 = 8, Offset3 = { 0.01, -0.01 } } },
    { "box", TEXT, { Enabled4 = 1, ElementShape4 = 2, Level4 = 1, Red4 = 0, Green4 = 0, Blue4 = 0, Opacity4 = 0.6,
        ExtendHorizontal4 = 0.15, ExtendVertical4 = 0.1, Round4 = 0.4 } },
    { "left_2lines", "Every moment\nis a possibility", { HorizontalJustificationNew = 0, HorizontalLeftCenterRight = -1, LineSpacing = 1.4, CharacterSpacing = 1.15 } },
    { "right_rot", TEXT, { HorizontalJustificationNew = 2, HorizontalLeftCenterRight = 1, AngleZ = 8 } },
    { "wordbox", TEXT, {} }, -- box behind "possibility" only, on an overlay copy
}

local function base_style(t, text)
    t:SetInput("StyledText", text)
    t:SetInput("Font", "Open Sans"); t:SetInput("Style", "Bold"); t:SetInput("Size", 0.07)
    t:SetInput("Red1", 1); t:SetInput("Green1", 1); t:SetInput("Blue1", 1)
    t:SetInput("Center", { 0.5, 0.3 })
end

local function apply(t, inputs)
    local got = {}
    for id, v in pairs(inputs) do
        local before = try(function() return t:GetInput(id) end)
        local ok = try(function() t:SetInput(id, v); return true end)
        local after = try(function() return t:GetInput(id) end)
        got[id] = { set = ok == true, before = before, after = after }
    end
    return got
end

local stills = 0
if not template then
    log("FAIL  No Text+ template in the Media Pool, so the looks were not tested.")
else
    local stamp = os.date("%H%M%S")
    local tl = try(function() return mp:CreateEmptyTimeline("MC_Spike6_" .. stamp) end)
    if not tl then log("FAIL  Could not make a scratch timeline.") else
        project:SetCurrentTimeline(tl)
        try(function() rv:OpenPage("edit") end)
        local start = tl:GetStartFrame()
        local list = {}
        for i = 1, #VARIANTS do
            list[i] = { mediaPoolItem = template, startFrame = 0, endFrame = 48, recordFrame = start + (i - 1) * 60, trackIndex = 1 }
        end
        local items = try(function() return mp:AppendToTimeline(list) end) or {}
        log("Scratch timeline " .. tl:GetName() .. ": placed " .. #items .. " of " .. #list)
        R.looks = {}
        for i, item in ipairs(items) do
            local v = VARIANTS[i]
            local comp = try(function() return item:GetFusionCompByIndex(1) end)
            local tp = comp and comp:FindTool("Template")
            if tp then
                comp:Lock()
                base_style(tp, v[2])
                local got = apply(tp, v[3])
                if i == 1 then
                    -- Every Text+ input with its name, for mapping the Inspector to Resolve
                    local out = {}
                    for _, inp in ipairs(objects(try(function() return tp:GetInputList() end))) do
                        local a = try(function() return inp:GetAttrs() end) or {}
                        local val = try(function() return tp:GetInput(a.INPS_ID) end)
                        if type(val) == "table" then val = "{" .. tostring(val[1]) .. ", " .. tostring(val[2]) .. "}" end
                        out[#out + 1] = string.format("%-34s %-30s %-22s %s", tostring(a.INPS_ID), tostring(a.INPS_Name),
                            tostring(a.INPID_InputControl), tostring(val))
                    end
                    table.sort(out)
                    write_file(BASE .. "spike6_inputs.txt", table.concat(out, "\n") .. "\n")
                    log("Text+ inputs: " .. #out .. " → spike6_inputs.txt")
                end
                if v[1] == "wordbox" then
                    -- Same text on top; its Follower shows only "possibility", with a box behind it
                    local ov = comp:AddTool("TextPlus", -32768, -32768)
                    base_style(ov, v[2])
                    got = apply(ov, { Enabled4 = 1, ElementShape4 = 2, Level4 = 3, Red4 = 1, Green4 = 0.35, Blue4 = 0.2, Opacity4 = 1,
                        ExtendHorizontal4 = 0.08, ExtendVertical4 = 0.06, Round4 = 0.3, Red1 = 1, Green1 = 1, Blue1 = 1 })
                    ov:AddModifier("StyledText", "StyledTextFollower")
                    local fo = driver(ov, "StyledText")
                    if fo then
                        fo:SetInput("Text", v[2]); fo:SetInput("Range", 1)
                        fo:SetInput("FirstCharacter", 18); fo:SetInput("LastCharacter", 28); fo:SetInput("Delay", 0)
                        -- Follower values only apply when animated: everything outside the range is hidden
                        ov:SetInput("Opacity1", 0)
                        fo:AddModifier("Opacity1", "BezierSpline")
                        local sp = driver(fo, "Opacity1")
                        if sp then sp:SetKeyFrames({ [0] = { 1 }, [47] = { 1 } }, true) end
                    end
                    local mg = comp:AddTool("Merge", -32768, -32768)
                    mg:ConnectInput("Background", tp)
                    mg:ConnectInput("Foreground", ov)
                    local out
                    for _, t in ipairs(objects(comp:GetToolList(false, "MediaOut"))) do out = t break end
                    if out then out:ConnectInput("Input", mg) end
                    got.follower = fo ~= nil
                end
                comp:Unlock()
                R.looks[v[1]] = got
                -- A still from the middle of the caption
                local tc = try(function() return tl:GetCurrentTimecode() end)
                local frame = start + (i - 1) * 60 + 24
                local fpsN = tonumber(tostring(tl:GetSetting("timelineFrameRate")):match("[%d%.]+")) or 24
                local nominal = math.floor(fpsN + 0.5)
                local sec = math.floor(frame / nominal)
                local code = string.format("%02d:%02d:%02d:%02d", math.floor(sec / 3600), math.floor(sec / 60) % 60, sec % 60, frame % nominal)
                try(function() tl:SetCurrentTimecode(code) end)
                local t = os.clock() + 0.6
                while os.clock() < t do end
                local p = BASE .. "stills\\s6_" .. i .. "_" .. v[1] .. ".jpg"
                os.remove(p)
                try(function() project:ExportCurrentFrameAsStill(p) end)
                if exists(p) then stills = stills + 1 end
                local parts = {}
                for id, g in pairs(got) do if type(g) == "table" then parts[#parts + 1] = id .. "=" .. tostring(g.after) end end
                log("  " .. v[1] .. ": " .. table.concat(parts, " "))
            end
        end
        log("Stills saved: " .. stills .. " → stills\\s6_*.jpg")
        if mine then project:SetCurrentTimeline(mine) end
        local del = try(function() return mp:DeleteTimelines({ tl }) end)
        log("Scratch timeline deleted: " .. tostring(del))
    end
end

R.stills = stills
R.finishedAt = os.date("%Y-%m-%dT%H:%M:%S")
write_file(BASE .. "spike6.json", json(R))
write_file(BASE .. "spike6.log", table.concat(lines, "\n") .. "\n")
log("Done. You can close this; MotionCaption reads the results itself.")
