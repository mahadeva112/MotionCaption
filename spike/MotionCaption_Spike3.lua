-- MotionCaption · Spike 3  (Workspace -> Scripts -> MotionCaption_Spike3)
--
-- Spike 2: comp:Paste() returned false on a caption's comp, so a generated .setting
-- could not be dropped in. This finds the way that does work, and tests the
-- Follower modifier for per-letter and per-word animation:
--   P  Paste: does it work at all here? (round trip, unlocked)
--   L  tool:LoadSettings(file) onto the caption's own Text+
--   A  Build with the API, ease with BezierSpline:SetKeyFrames
--   F  Follower: letter-by-letter cascade, and one word picked out by character range
--   U  Bangla text, plain and with a per-letter cascade
--
-- Each caption on track "MotionCaption" names its test, so the viewer check is easy.
-- Builds a new timeline "MC_Spike3_<time>"; touches nothing else. Does not save the project.

local OUT = (os.getenv("TEMP") or os.getenv("TMP") or ".") .. "\\"
local LOG = OUT .. "MotionCaption_Spike3.log"
local lines, results = {}, {}

local function log(s)
    s = tostring(s)
    lines[#lines + 1] = s
    print("[MotionCaption] " .. s)
end

local function flush()
    local f = io.open(LOG, "w")
    if f then f:write(table.concat(lines, "\n"), "\n"); f:close() end
end

local function result(name, ok, detail)
    results[#results + 1] = { name = name, ok = ok }
    local tag = ok == true and "PASS" or ok == false and "FAIL" or "INFO"
    log(tag .. "  " .. name .. (detail ~= nil and ("  —  " .. tostring(detail)) or ""))
end

local function try(fn)
    local ok, a = pcall(fn)
    if ok then return a end
    return nil, a
end

local function near(a, b) return type(a) == "number" and math.abs(a - b) < 1e-4 end

local function write_file(p, s)
    local f = io.open(p, "wb")
    if not f then return false end
    f:write(s); f:close()
    return true
end

local function objects(t)
    local out = {}
    for k, v in pairs(t or {}) do out[#out + 1] = type(v) ~= "number" and v or k end
    return out
end

local function dump(v, depth)
    depth = depth or 0
    if type(v) ~= "table" or depth > 2 then return tostring(v) end
    local parts = {}
    for k, x in pairs(v) do parts[#parts + 1] = tostring(k) .. "=" .. dump(x, depth + 1) end
    table.sort(parts)
    return "{" .. table.concat(parts, ", ") .. "}"
end

local rv = resolve or (fusion and fusion:GetResolve())
if not rv then
    print("[MotionCaption] This scripting host has no Resolve object.")
    return
end

log("MotionCaption Spike 3 · " .. os.date("%Y-%m-%d %H:%M:%S"))
log("Resolve " .. tostring(try(function() return rv:GetVersionString() end)))
log(string.rep("-", 60))

local BANGLA = "জীবনকে পূর্ণভাবে অনুভব করুন"
local POP = {
    [0] = { 0.02, RH = { 4, 0.11 } },
    [12] = { 0.12, LH = { 9, 0.12 }, RH = { 14.6667, 0.12 } },
    [20] = { 0.08, LH = { 17.3333, 0.08 } },
}

local function main()
local project = rv:GetProjectManager():GetCurrentProject()
if not project then result("Project is open", false); return end
local mp = project:GetMediaPool()

local template
local function scan(folder, depth)
    if not folder or depth > 3 or template then return end
    for _, clip in ipairs(objects(try(function() return folder:GetClipList() end))) do
        if tostring(try(function() return clip:GetClipProperty("Type") end)):match("Fusion Title") then template = clip; return end
    end
    for _, sub in ipairs(objects(try(function() return folder:GetSubFolderList() end))) do scan(sub, depth + 1) end
end
scan(mp:GetRootFolder(), 0)
if not template then result("Text+ title in the Media Pool", false, "Drag Effects → Titles → Text+ into the Media Pool."); return end

local tl = try(function() return mp:CreateEmptyTimeline("MC_Spike3_" .. os.date("%H%M%S")) end)
if not tl then result("Create a test timeline", false); return end
project:SetCurrentTimeline(tl)
try(function() rv:OpenPage("edit") end)
local fps = tonumber(tl:GetSetting("timelineFrameRate")) or 24
local tlStart = tl:GetStartFrame()
try(function() tl:AddTrack("video") end)
local track = tl:GetTrackCount("video")
try(function() tl:SetTrackName("video", track, "MotionCaption") end)

local LABELS = {
    "1 Paste round trip", "2 LoadSettings pop", "3 API eased pop", "4 Every letter cascades in",
    "Every moment is a possibility", BANGLA, BANGLA,
}
local len = math.floor(2 * fps + 0.5)
local gap = math.floor(0.5 * fps + 0.5)
local infos = {}
for i = 1, #LABELS do
    infos[i] = { mediaPoolItem = template, startFrame = 0, endFrame = len, recordFrame = tlStart + (i - 1) * (len + gap) + fps, trackIndex = track }
end
local items = try(function() return mp:AppendToTimeline(infos) end) or {}
result("Place " .. #LABELS .. " test captions", #items == #LABELS, tl:GetName() .. " · " .. fps .. " fps")
if #items ~= #LABELS then return end

local function parts(i)
    local comp = items[i]:GetFusionCompByIndex(1)
    local tp = comp:FindTool("Template")
    try(function() tp:SetInput("StyledText", LABELS[i]) end)
    return comp, tp
end

local function spline_of(tool, id)
    local out = try(function() return tool[id]:GetConnectedOutput() end)
    return out and out:GetTool()
end

local function eased_pop(comp, tp)
    comp:Lock()
    local ok, err = pcall(function()
        tp:AddModifier("Size", "BezierSpline")
        local sp = spline_of(tp, "Size")
        assert(sp, "no spline on Size")
        sp:SetKeyFrames(POP, true)
    end)
    comp:Unlock()
    return ok, err
end

-- ── P: Paste ───────────────────────────────────────────────────────────────
log("")
log("P · Paste")
do
    local compA, tpA = parts(1)
    local copied = try(function() return compA:CopySettings({ tpA }) end)
    local compB = items[2]:GetFusionCompByIndex(1)
    local pastedLocked = copied and try(function() compB:Lock(); local r = compB:Paste(copied); compB:Unlock(); return r end)
    local pastedOpen = copied and try(function() return compB:Paste(copied) end)
    result("P1 Paste a CopySettings table into another caption", pastedLocked == true or pastedOpen == true,
        "locked → " .. tostring(pastedLocked) .. " · unlocked → " .. tostring(pastedOpen))
    -- Clean up anything that did get pasted, so caption 2 stays a clean test
    for _, t in ipairs(objects(compB:GetToolList(false, "TextPlus"))) do
        if t.Name ~= "Template" then try(function() t:Delete() end) end
    end
end

-- ── L: LoadSettings onto the existing Text+ ────────────────────────────────
log("")
log("L · tool:LoadSettings")
do
    local comp, tp = parts(2)
    local p = OUT .. "MC_Spike3_pop.setting"
    write_file(p, [[
{
	Tools = ordered() {
		Template = TextPlus {
			Inputs = {
				StyledText = Input { Value = "2 LoadSettings pop" },
				Size = Input { SourceOp = "TemplateSize", Source = "Value" },
				Red1 = Input { Value = 0.4 },
				Green1 = Input { Value = 0.85 },
				Blue1 = Input { Value = 1 },
			},
		},
		TemplateSize = BezierSpline {
			KeyFrames = {
				[0] = { 0.02, RH = { 4, 0.11 } },
				[12] = { 0.12, LH = { 9, 0.12 }, RH = { 14.6667, 0.12 } },
				[20] = { 0.08, LH = { 17.3333, 0.08 } },
			},
		},
	},
}
]])
    comp:Lock()
    local r, err = try(function() return tp:LoadSettings(p) end)
    comp:Unlock()
    local f6 = try(function() return tp:GetInput("Size", 6) end)
    local blue = try(function() return tp:GetInput("Green1") end)
    result("L1 LoadSettings returns", r ~= nil and r ~= false, tostring(r) .. (err and (" · " .. tostring(err)) or ""))
    result("L2 Plain values arrive (colour)", near(blue, 0.85), "Green1=" .. tostring(blue))
    result("L3 Eased keys arrive (linear would be 0.070)", type(f6) == "number" and f6 > 0.08, "f6=" .. tostring(f6))
end

-- ── A: API + SetKeyFrames ──────────────────────────────────────────────────
log("")
log("A · API build with eased keys")
do
    local comp, tp = parts(3)
    local ok, err = eased_pop(comp, tp)
    local f6 = try(function() return tp:GetInput("Size", 6) end)
    local f20 = try(function() return tp:GetInput("Size", 20) end)
    result("A1 SetKeyFrames on the Size spline", ok, err)
    result("A2 Eased (linear would be 0.070 at frame 6)", type(f6) == "number" and f6 > 0.08, "f6=" .. tostring(f6))
    result("A3 Key values exact", near(f20, 0.08), "f20=" .. tostring(f20))
    local sp = spline_of(tp, "Size")
    local back = sp and try(function() return sp:GetKeyFrames() end)
    log("     GetKeyFrames → " .. dump(back))
end

-- ── F: Follower ────────────────────────────────────────────────────────────
log("")
log("F · Follower")
local function follower(comp, tp, text)
    comp:Lock()
    local fo
    local ok, err = pcall(function()
        tp:AddModifier("StyledText", "StyledTextFollower")
        fo = spline_of(tp, "StyledText")
        assert(fo and fo:GetAttrs().TOOLS_RegID == "StyledTextFollower", "Follower not attached")
        fo:SetInput("Text", text)
        fo:SetInput("Order", 1) -- Left to Right (the default, 7, is Manual Curve)
    end)
    comp:Unlock()
    return ok and fo or nil, err
end

do
    local comp, tp = parts(4)
    local fo, err = follower(comp, tp, LABELS[4])
    result("F1 Attach a Follower and give it the text", fo ~= nil, err)
    if fo then
        for _, id in ipairs({ "Range", "Order", "DelayType", "Delay" }) do
            local at = try(function() return fo[id]:GetAttrs() end) or {}
            local keep = {}
            for k, v in pairs(at) do
                if type(v) ~= "table" or k:match("Combo") or k:match("MultiButton") then keep[k] = v end
            end
            log("     " .. id .. " = " .. tostring(try(function() return fo:GetInput(id) end)) .. " · " .. dump(keep))
        end
        local txt = try(function() return tp:GetInput("StyledText") end)
        result("F2 Text+ shows the Follower's text", txt == LABELS[4], tostring(txt))
        -- Cascade: every letter fades in over 6 frames, each starting 2 frames after the last
        comp:Lock()
        local ok2, err2 = pcall(function()
            fo:SetInput("Delay", 2)
            fo:AddModifier("Opacity1", "BezierSpline")
            local sp = spline_of(fo, "Opacity1")
            sp:SetKeyFrames({ [0] = { 0, RH = { 2, 0.5 } }, [6] = { 1, LH = { 4, 1 } } }, true)
        end)
        comp:Unlock()
        result("F3 Animate Opacity1 with a per-letter delay", ok2, err2)
    end
end

do
    local comp, tp = parts(5)
    local text = LABELS[5]
    local a, b = text:find("possibility", 1, true)
    local fo, err = follower(comp, tp, text)
    result("F4 Follower for one word (“possibility”, chars " .. tostring(a) .. "–" .. tostring(b) .. ")", fo ~= nil, err)
    if fo then
        comp:Lock()
        local ok2, err2 = pcall(function()
            -- Range 1 is expected to mean "Custom"; the log above shows the real choices
            fo:SetInput("Range", 1)
            fo:SetInput("FirstCharacter", a - 1)
            fo:SetInput("LastCharacter", b - 1)
            fo:SetInput("Delay", 0)
            fo:SetInput("Red1", 1)
            fo:SetInput("Green1", 0.8)
            fo:SetInput("Blue1", 0.2)
            fo:AddModifier("CharacterSizeX", "BezierSpline")
            spline_of(fo, "CharacterSizeX"):SetKeyFrames({ [0] = { 1 }, [8] = { 1.35, RH = { 11, 1.35 } }, [16] = { 1, LH = { 13, 1 } } }, true)
            fo:AddModifier("CharacterSizeY", "BezierSpline")
            spline_of(fo, "CharacterSizeY"):SetKeyFrames({ [0] = { 1 }, [8] = { 1.35, RH = { 11, 1.35 } }, [16] = { 1, LH = { 13, 1 } } }, true)
        end)
        comp:Unlock()
        result("F5 Colour + pop on that word only", ok2, err2)
        log("     Range=" .. tostring(try(function() return fo:GetInput("Range") end))
            .. " First=" .. tostring(try(function() return fo:GetInput("FirstCharacter") end))
            .. " Last=" .. tostring(try(function() return fo:GetInput("LastCharacter") end)))
    end
    local st = try(function()
        local fo2 = spline_of(tp, "StyledText")
        return comp:CopySettings({ tp, fo2 })
    end)
    if st then try(function() bmd.writefile(OUT .. "MC_Spike3_WordFollower.setting", st) end) end
end

-- ── U: Bangla ──────────────────────────────────────────────────────────────
log("")
log("U · Bangla")
do
    local comp, tp = parts(6)
    try(function() tp:SetInput("Font", "Nirmala UI"); tp:SetInput("Style", "Bold") end)
    local back = try(function() return tp:GetInput("StyledText") end)
    result("U1 Bangla text set on Text+ unchanged", back == BANGLA, back)
    eased_pop(comp, tp)

    local comp2, tp2 = parts(7)
    try(function() tp2:SetInput("Font", "Nirmala UI"); tp2:SetInput("Style", "Bold") end)
    local fo = follower(comp2, tp2, BANGLA)
    if fo then
        comp2:Lock()
        pcall(function()
            fo:SetInput("Delay", 2)
            fo:AddModifier("Opacity1", "BezierSpline")
            spline_of(fo, "Opacity1"):SetKeyFrames({ [0] = { 0 }, [6] = { 1 } }, true)
        end)
        comp2:Unlock()
    end
    result("U2 Bangla with a per-letter cascade", fo ~= nil, "check the letters in the viewer")
end

-- ── V: still frames, so the look can be checked from images ────────────────
log("")
log("V · Still frames → " .. OUT .. "MC_Snap\\")
local tcFps = math.max(1, math.floor(fps + 0.5))
local function tc_of(frame)
    local s = math.floor(frame / tcFps)
    return string.format("%02d:%02d:%02d:%02d", math.floor(s / 3600), math.floor(s / 60) % 60, s % 60, frame % tcFps)
end
local function pause(s) local t = os.clock() + s; while os.clock() < t do end end
local SHOTS = { [2] = { 6, 30 }, [3] = { 6, 30 }, [4] = { 4, 14, 40 }, [5] = { 0, 8, 30 }, [6] = { 30 }, [7] = { 8, 20, 44 } }
local saved, missed, firstErr = 0, 0, nil
for i = 2, 7 do
    for _, off in ipairs(SHOTS[i]) do
        try(function() tl:SetCurrentTimecode(tc_of(items[i]:GetStart() + off)) end)
        pause(0.4)
        local p = OUT .. "MC_Snap\\" .. string.format("c%d_f%02d.png", i, off)
        os.remove(p)
        local r, err = try(function() return project:ExportCurrentFrameAsStill(p) end)
        local fh = io.open(p, "rb")
        if fh then fh:close(); saved = saved + 1 else missed = missed + 1; firstErr = firstErr or (tostring(r) .. " " .. tostring(err or "")) end
    end
end
result("V1 Export still frames", saved > 0, saved .. " saved · " .. missed .. " missing" .. (firstErr and (" · first: " .. firstErr) or ""))
end

local okMain, errMain = pcall(main)
if not okMain then result("Script stopped early", false, errMain) end

local pass, fail = 0, 0
for _, r in ipairs(results) do
    if r.ok == true then pass = pass + 1 elseif r.ok == false then fail = fail + 1 end
end
log(string.rep("-", 60))
log(string.format("Summary: %d passed · %d failed", pass, fail))
log("Viewer check, track “MotionCaption” (7 captions, 2 s each):")
log("  2 and 3 · pop in fast, settle softly. 2 is light blue.")
log("  4 · letters appear one after another, left to right.")
log("  5 · only “possibility” turns yellow and grows, then settles.")
log("  6 · Bangla, still: are যুক্তাক্ষর and কার joined correctly?")
log("  7 · Bangla, letter by letter: do the joined letters break apart?")
log("Log file: " .. LOG)
flush()
pcall(function() bmd.openfileexternal("Open", LOG) end)
