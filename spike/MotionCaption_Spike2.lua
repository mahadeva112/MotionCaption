-- MotionCaption · Spike 2  (Workspace -> Scripts -> MotionCaption_Spike2)
--
-- Phase 0 proved the Resolve calls. This answers what the Phase 1 design leans on:
--   J  Can the bridge read a job file the app wrote (Lua table text, UTF-8)?
--   B  Can many captions go in at once, each at its exact start and length?
--   S  Can a generated .setting (eased keys + word layer) be loaded into each caption?
--   D  Which Text+ modifiers exist (Follower, Character Level Styling) and what do they save as?
--   T  Can the Text+ template travel as a .drb bin (so users never drag it in by hand)?
--
-- Needs the "Text+" title in the Media Pool (from the Phase 0 run).
-- Safe by design: builds a new timeline "MC_Spike2_<time>"; moves the Text+ clip into a
-- temporary bin for the export and back again. Does not save the project.
-- Results: Console + %TEMP%\MotionCaption_Spike2.log. No `require`, no os.execute.

local OUT = (os.getenv("TEMP") or os.getenv("TMP") or ".") .. "\\"
local LOG = OUT .. "MotionCaption_Spike2.log"
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

local function file_size(p)
    local f = io.open(p, "rb")
    if not f then return nil end
    local n = f:seek("end"); f:close()
    return n
end

-- Resolve's Lua tables are not always {index = object}; take whichever side is the object
local function objects(t)
    local out = {}
    for k, v in pairs(t or {}) do out[#out + 1] = type(v) ~= "number" and v or k end
    return out
end

local rv = resolve or (fusion and fusion:GetResolve())
if not rv then
    print("[MotionCaption] This scripting host has no Resolve object.")
    return
end

log("MotionCaption Spike 2 · " .. os.date("%Y-%m-%d %H:%M:%S"))
log("Resolve " .. tostring(try(function() return rv:GetVersionString() end))
    .. " · " .. tostring(try(function() return rv:GetProductName() end)))
log("Lua: loadfile=" .. type(loadfile) .. " setfenv=" .. type(setfenv) .. " jit=" .. type(jit)
    .. " ffi=" .. type(ffi) .. " bit=" .. type(bit) .. " bmd.readstring=" .. type(bmd and bmd.readstring))
log(string.rep("-", 60))

-- The sample job the app would write. Text covers Bangla, quotes and a backslash.
local BANGLA = "জীবনকে পূর্ণভাবে অনুভব করুন"
local QUOTED = [[He said "go" \ now]]
local SAMPLE = {
    "Life is not about", "what you do,", "it is about", "how you do it.",
    "Every moment", "is a possibility", "to grow.", "Stillness is not", "the end of motion,",
    "it is the source.", QUOTED, BANGLA,
}

local function lua_str(s) return string.format("%q", s) end

local function job_text()
    local t = { "return {", "  version = 1,", "  cues = {" }
    for i, text in ipairs(SAMPLE) do
        -- Odd millisecond values on purpose: rounding to frames must happen in the bridge
        local s = 1000 + (i - 1) * 1750 + (i % 3) * 17
        t[#t + 1] = string.format("    { id = %d, startMs = %d, endMs = %d, text = %s },", i, s, s + 1500, lua_str(text))
    end
    t[#t + 1] = "  },"
    t[#t + 1] = "}"
    return table.concat(t, "\n")
end

-- One caption: eased "pop" on the caption, a word layer that fades in on eased keys
local function caption_setting(text, word, font)
    return [[
{
	Tools = ordered() {
		MC_Caption = TextPlus {
			Inputs = {
				UseFrameFormatSettings = Input { Value = 1 },
				StyledText = Input { Value = ]] .. lua_str(text) .. [[ },
				Font = Input { Value = ]] .. lua_str(font) .. [[ },
				Style = Input { Value = "Bold" },
				Size = Input { SourceOp = "MC_CaptionSize", Source = "Value" },
				VerticalJustificationNew = Input { Value = 3 },
				HorizontalJustificationNew = Input { Value = 3 },
			},
		},
		MC_CaptionSize = BezierSpline {
			SplineColor = { Red = 225, Green = 0, Blue = 225 },
			KeyFrames = {
				[0] = { 0.02, RH = { 4, 0.11 } },
				[12] = { 0.12, LH = { 9, 0.12 }, RH = { 14.6667, 0.12 } },
				[20] = { 0.08, LH = { 17.3333, 0.08 } },
			},
		},
		MC_Word = TextPlus {
			Inputs = {
				UseFrameFormatSettings = Input { Value = 1 },
				StyledText = Input { Value = ]] .. lua_str(word) .. [[ },
				Font = Input { Value = ]] .. lua_str(font) .. [[ },
				Style = Input { Value = "Bold" },
				Size = Input { Value = 0.06 },
				Center = Input { Value = { 0.5, 0.36 } },
				Red1 = Input { Value = 1 },
				Green1 = Input { Value = 0.8 },
				Blue1 = Input { Value = 0.2 },
				VerticalJustificationNew = Input { Value = 3 },
				HorizontalJustificationNew = Input { Value = 3 },
			},
		},
		MC_Merge = Merge {
			Inputs = {
				Background = Input { SourceOp = "MC_Caption", Source = "Output" },
				Foreground = Input { SourceOp = "MC_Word", Source = "Output" },
				Blend = Input { SourceOp = "MC_MergeBlend", Source = "Value" },
				PerformDepthMerge = Input { Value = 0 },
			},
		},
		MC_MergeBlend = BezierSpline {
			SplineColor = { Red = 205, Green = 205, Blue = 205 },
			KeyFrames = {
				[0] = { 0, RH = { 2.6667, 0 } },
				[8] = { 0, LH = { 5.3333, 0 }, RH = { 10, 0.9 } },
				[16] = { 1, LH = { 13, 1 } },
			},
		},
	},
}
]]
end

local function main()
local pm = rv:GetProjectManager()
local project = pm and pm:GetCurrentProject()
if not project then
    result("Project is open", false, "Open the test project, then run this again.")
    return
end
local mp = project:GetMediaPool()

-- ── J: read the job file ───────────────────────────────────────────────────
log("")
log("J · Job file from the app")
local jobPath = OUT .. "MC_Spike2_job.lua"
write_file(jobPath, job_text())
local job
do
    local fn, lerr = loadfile(jobPath)
    if fn and setfenv then setfenv(fn, {}) end -- the job gets no globals: it can only be data
    local ok, val = false, lerr
    if fn then ok, val = pcall(fn) end
    job = ok and type(val) == "table" and val or nil
    result("J1 Load the job with loadfile (no globals)", job ~= nil, job and (#job.cues .. " cues") or tostring(val))
end
if not job then return end
result("J2 UTF-8 text survives (Bangla, quotes, backslash)",
    job.cues[#job.cues].text == BANGLA and job.cues[#job.cues - 1].text == QUOTED,
    job.cues[#job.cues].text)

-- ── Template in the Media Pool ─────────────────────────────────────────────
local template, templateFolder
local function scan(folder, depth)
    if not folder or depth > 3 or template then return end
    for _, clip in ipairs(objects(try(function() return folder:GetClipList() end))) do
        local ty = tostring(try(function() return clip:GetClipProperty("Type") end) or "")
        if not template and ty:match("Fusion Title") then template, templateFolder = clip, folder end
    end
    for _, sub in ipairs(objects(try(function() return folder:GetSubFolderList() end))) do scan(sub, depth + 1) end
end
scan(mp:GetRootFolder(), 0)
if not template then
    result("Text+ title in the Media Pool", false, "Drag Effects → Titles → Text+ into the Media Pool, then run again.")
    return
end
result("Text+ title in the Media Pool", true, template:GetName() .. " in bin “" .. tostring(templateFolder:GetName()) .. "”")

-- ── B: all captions in one call ────────────────────────────────────────────
log("")
log("B · Bulk placement")
local name = "MC_Spike2_" .. os.date("%H%M%S")
local tl = try(function() return mp:CreateEmptyTimeline(name) end)
if not tl then
    result("Create a test timeline", false, "CreateEmptyTimeline returned nothing")
    return
end
project:SetCurrentTimeline(tl)
try(function() rv:OpenPage("edit") end)
local fps = tonumber(tl:GetSetting("timelineFrameRate"))
local tlStart = tl:GetStartFrame()
result("Create a test timeline", fps ~= nil, name .. " · " .. tostring(fps) .. " fps · start " .. tlStart)
if not fps then return end

try(function() tl:AddTrack("video") end)
local track = tl:GetTrackCount("video")
local named = try(function() return tl:SetTrackName("video", track, "MotionCaption") end)
result("B1 Name the caption track", named == true, "V" .. track .. " → " .. tostring(try(function() return tl:GetTrackName("video", track) end)))

-- Frames come from the timeline's own rate; never a fixed fps
local function frame_of(ms) return math.floor(ms * fps / 1000 + 0.5) end
local infos, want = {}, {}
for i, c in ipairs(job.cues) do
    local s, e = frame_of(c.startMs), frame_of(c.endMs)
    want[i] = { start = tlStart + s, len = e - s }
    -- endFrame is exclusive (Phase 0: endFrame 44 gave 44 frames)
    infos[i] = { mediaPoolItem = template, startFrame = 0, endFrame = e - s, recordFrame = tlStart + s, trackIndex = track }
end
local c0, t0 = os.clock(), os.time()
local items = try(function() return mp:AppendToTimeline(infos) end) or {}
local appendSecs = os.time() - t0
result("B2 Append " .. #infos .. " captions in one call", #items == #infos,
    #items .. " placed · " .. string.format("%.2f s CPU, ~%d s wall", os.clock() - c0, appendSecs))

local bad = {}
for i, it in ipairs(items) do
    local gs, gd = it:GetStart(), it:GetDuration()
    if gs ~= want[i].start or gd ~= want[i].len then
        bad[#bad + 1] = string.format("#%d wanted %d+%d got %d+%d", i, want[i].start, want[i].len, gs, gd)
    end
end
result("B3 Every start and length is exact", #items > 0 and #bad == 0, #bad == 0 and "all match" or table.concat(bad, "; "))

-- ── S: load the generated .setting into every caption ──────────────────────
log("")
log("S · Generated .setting into each caption")
local first = items[1] and try(function() return items[1]:GetFusionCompByIndex(1) end)
if first then
    local a = first:GetAttrs()
    log("     caption 1 comp frames " .. tostring(a.COMPN_RenderStart) .. "–" .. tostring(a.COMPN_RenderEnd))
end

-- Paste needs the setting as a table; prefer bmd.readstring, fall back to a file
local function setting_table(text, i)
    local t = bmd.readstring and try(function() return bmd.readstring(text) end)
    if type(t) == "table" then return t, "readstring" end
    local p = OUT .. "MC_Spike2_caption" .. i .. ".setting"
    write_file(p, text)
    t = try(function() return bmd.readfile(p) end)
    return type(t) == "table" and t or nil, "readfile"
end

local okCount, how, firstErr = 0, nil, nil
local c1, t1 = os.clock(), os.time()
for i, it in ipairs(items) do
    local comp = try(function() return it:GetFusionCompByIndex(1) end)
    local text = job.cues[i].text
    local word = text:match("^(%S+)") or text
    local font = text == BANGLA and "Nirmala UI" or "Open Sans"
    local ok, err = pcall(function()
        local tbl, via = setting_table(caption_setting(text, word, font), i)
        how = how or via
        assert(tbl, "could not turn the setting text into a table")
        comp:Lock()
        local pasted = comp:Paste(tbl)
        local merge = comp:FindTool("MC_Merge")
        local out
        for _, t in ipairs(objects(comp:GetToolList(false, "MediaOut"))) do out = t break end
        assert(merge, "MC_Merge not found after Paste (" .. tostring(pasted) .. ")")
        out:ConnectInput("Input", merge)
        local old = comp:FindTool("Template")
        if old then old:Delete() end
        comp:Unlock()
    end)
    if ok then okCount = okCount + 1 else
        firstErr = firstErr or err
        try(function() comp:Unlock() end)
    end
end
result("S1 Paste the setting into every caption", okCount == #items and okCount > 0,
    okCount .. "/" .. #items .. " via " .. tostring(how) .. " · " .. string.format("%.2f s CPU, ~%d s wall", os.clock() - c1, os.time() - t1)
    .. (firstErr and (" · first error: " .. tostring(firstErr)) or ""))

if first and okCount > 0 then
    local cap = first:FindTool("MC_Caption")
    local mid = cap and try(function() return cap:GetInput("Size", 6) end)
    result("S2 Eased keys (linear would give 0.070 at frame 6)", type(mid) == "number" and mid > 0.08,
        type(mid) == "number" and string.format("f6=%.3f", mid) or "no value")
    local endv = cap and try(function() return cap:GetInput("Size", 20) end)
    result("S3 Key values land exactly", near(endv, 0.08), tostring(endv))
    local out
    for _, t in ipairs(objects(first:GetToolList(false, "MediaOut"))) do out = t break end
    local wired = out and try(function() return out.Input:GetConnectedOutput():GetTool().Name end)
    result("S4 Output shows the merged caption", wired == "MC_Merge", "MediaOut <- " .. tostring(wired))
    result("S5 Old Template tool removed", first:FindTool("Template") == nil)
    local b = first:FindTool("MC_Merge")
    local b4, b16 = b and try(function() return b:GetInput("Blend", 4) end), b and try(function() return b:GetInput("Blend", 16) end)
    result("S6 Word layer hidden, then shown", near(b4, 0) and near(b16, 1), "blend f4=" .. tostring(b4) .. " f16=" .. tostring(b16))
end
local lastComp = items[#items] and try(function() return items[#items]:GetFusionCompByIndex(1) end)
local lastCap = lastComp and lastComp:FindTool("MC_Caption")
local lastText = lastCap and try(function() return lastCap:GetInput("StyledText") end)
result("S7 Bangla text reached Text+ unchanged", lastText == BANGLA, lastText)
local qComp = items[#items - 1] and try(function() return items[#items - 1]:GetFusionCompByIndex(1) end)
local qCap = qComp and qComp:FindTool("MC_Caption")
result("S8 Quotes and backslash reached Text+ unchanged", qCap and try(function() return qCap:GetInput("StyledText") end) == QUOTED)

-- ── D: which Text+ modifiers exist ─────────────────────────────────────────
log("")
log("D · Text+ modifiers (discovery)")
local regs = {}
for _, r in ipairs(objects(try(function() return fusion:GetRegList(CT_Modifier) end))) do
    local at = try(function() return r:GetAttrs() end) or {}
    local id = tostring(at.REGS_ID)
    if id:match("Text") or id:match("Follow") or id:match("CLS") or id:match("Styl") then
        regs[#regs + 1] = id .. "=" .. tostring(at.REGS_Name)
    end
end
result("D1 Text modifiers registered", nil, #regs > 0 and table.concat(regs, ", ") or "none listed (GetRegList unavailable?)")

local probe = try(function()
    return mp:AppendToTimeline({ { mediaPoolItem = template, startFrame = 0, endFrame = 2 * math.floor(fps + 0.5),
        recordFrame = want[#want].start + want[#want].len + math.floor(fps + 0.5), trackIndex = track } })
end)
probe = probe and probe[1]
local pcomp = probe and try(function() return probe:GetFusionCompByIndex(1) end)
local ptp
for _, t in ipairs(objects(pcomp and try(function() return pcomp:GetToolList(false, "TextPlus") end))) do ptp = t break end
if ptp then
    try(function() ptp:SetInput("StyledText", "Follower test") end)
    for _, id in ipairs({ "StyledTextFollower", "StyledTextCLS" }) do
        pcomp:Lock()
        local ok, err = pcall(function() return ptp:AddModifier("StyledText", id) end)
        pcomp:Unlock()
        local src = try(function() return ptp.StyledText:GetConnectedOutput():GetTool() end)
        local srcId = src and try(function() return src:GetAttrs().TOOLS_RegID end)
        result("D2 AddModifier StyledText ← " .. id, nil, (ok and "call ok" or ("error " .. tostring(err))) .. " · now driven by " .. tostring(srcId))
        if src and srcId == id then
            local ins = {}
            for _, inp in ipairs(objects(try(function() return src:GetInputList() end))) do
                local at = try(function() return inp:GetAttrs() end) or {}
                ins[#ins + 1] = tostring(at.INPS_ID)
            end
            log("       " .. id .. " inputs (" .. #ins .. "): " .. table.concat(ins, ", ", 1, math.min(#ins, 120)))
            local p = OUT .. "MC_Spike2_" .. id .. ".setting"
            local st = try(function() return pcomp:CopySettings({ ptp, src }) end)
            if st then try(function() bmd.writefile(p, st) end) end
            log("       saved " .. p .. " · " .. tostring(file_size(p)) .. " bytes")
            -- Disconnect so the next modifier starts clean
            try(function() ptp.StyledText:ConnectTo(nil) end)
            try(function() ptp:SetInput("StyledText", "Follower test") end)
        end
    end
else
    result("D2 Modifier probe", false, "could not add the probe title")
end

-- ── T: ship the template as a .drb bin ─────────────────────────────────────
log("")
log("T · Template as a .drb bin")
local drb = OUT .. "MC_Spike2_Template.drb"
os.remove(drb)
local root = mp:GetRootFolder()
local bin = try(function() return mp:AddSubFolder(root, "MC_Spike2_Export") end)
local moved = bin and try(function() return mp:MoveClips({ template }, bin) end)
local exported = moved and try(function() return bin:Export(drb) end)
-- Put the user's Text+ back where it was before anything else
if moved then try(function() mp:MoveClips({ template }, templateFolder) end) end
result("T1 Export a bin holding the Text+ as .drb", exported == true and (file_size(drb) or 0) > 0,
    tostring(file_size(drb)) .. " bytes · Folder:Export → " .. tostring(exported))
if exported then
    local imp = try(function() return mp:AddSubFolder(root, "MC_Spike2_Import") end)
    if imp then try(function() mp:SetCurrentFolder(imp) end) end
    local okImp = try(function() return mp:ImportFolderFromFile(drb) end)
    local found
    local function seek(folder, depth)
        if not folder or depth > 3 or found then return end
        for _, clip in ipairs(objects(try(function() return folder:GetClipList() end))) do
            if tostring(try(function() return clip:GetClipProperty("Type") end)):match("Fusion Title") then found = clip end
        end
        for _, sub in ipairs(objects(try(function() return folder:GetSubFolderList() end))) do seek(sub, depth + 1) end
    end
    seek(imp, 0)
    result("T2 Import the .drb and find a usable Text+", found ~= nil,
        "ImportFolderFromFile → " .. tostring(okImp) .. (found and (" · " .. found:GetName()) or ""))
    try(function() mp:SetCurrentFolder(root) end)
end
log("     (bins MC_Spike2_Export / MC_Spike2_Import can be deleted after the check)")
end

local okMain, errMain = pcall(main)
if not okMain then result("Script stopped early", false, errMain) end

local pass, fail = 0, 0
for _, r in ipairs(results) do
    if r.ok == true then pass = pass + 1 elseif r.ok == false then fail = fail + 1 end
end
log(string.rep("-", 60))
log(string.format("Summary: %d passed · %d failed", pass, fail))
log("Now look at the Edit page viewer, track “MotionCaption”:")
log("  · Each caption should pop in smoothly (fast start, soft stop), not at an even speed.")
log("  · A yellow first word should fade in under each caption.")
log("  · The last caption is Bangla: are the letters joined correctly (যুক্তাক্ষর, কার)?")
log("Log file: " .. LOG)
flush()
pcall(function() bmd.openfileexternal("Open", LOG) end)
