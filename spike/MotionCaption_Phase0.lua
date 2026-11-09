-- MotionCaption · Phase 0 spike  (Workspace -> Scripts -> MotionCaption_Phase0)
--
-- Answers, on THIS Resolve build, the questions the product depends on:
--   1. Can a script put a Text+ title on the timeline, at an exact frame?
--   2. Can it open that title's Fusion comp and keyframe Text+ inputs?
--   3. Can it add a second Text+ and a Merge (the "selected words" layer)?
--   4. Can it save Text+ as a .setting file (the template fallback)?
--   5. Can a caption get an exact length (via a Media Pool title + AppendToTimeline)?
--
-- Safe by design: it builds its own new timeline "MC_Phase0_<time>" in the
-- current project and touches nothing else. It does not save the project.
-- Results go to the Console and to %TEMP%\MotionCaption_Phase0.log.
--
-- Resolve 21.1's Lua host has no `package` table, so nothing here uses require.
-- os.execute is avoided too: it flashes a console window on Windows.

local OUT = (os.getenv("TEMP") or os.getenv("TMP") or ".") .. "\\"
local LOG = OUT .. "MotionCaption_Phase0.log"
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

-- ok: true = PASS, false = FAIL, nil = INFO (observed, not judged)
local function result(name, ok, detail)
    results[#results + 1] = { name = name, ok = ok }
    local tag = ok == true and "PASS" or ok == false and "FAIL" or "INFO"
    log(tag .. "  " .. name .. (detail ~= nil and ("  —  " .. tostring(detail)) or ""))
end

-- pcall that returns (value) on success or (nil, error) on failure
local function try(fn)
    local ok, a = pcall(fn)
    if ok then return a end
    return nil, a
end

local function near(a, b) return type(a) == "number" and math.abs(a - b) < 1e-4 end

local function file_size(p)
    local f = io.open(p, "rb")
    if not f then return nil end
    local n = f:seek("end"); f:close()
    return n
end

local rv = resolve or (fusion and fusion:GetResolve())
if not rv then
    print("[MotionCaption] This scripting host has no Resolve object.")
    return
end

log("MotionCaption Phase 0 spike · " .. os.date("%Y-%m-%d %H:%M:%S"))
log("Resolve " .. tostring(try(function() return rv:GetVersionString() end))
    .. " · " .. tostring(try(function() return rv:GetProductName() end)))
log(string.rep("-", 60))

-- Everything runs inside main() so an unexpected error still ends with a log file
local function main()
local pm = rv:GetProjectManager()
local project = pm and pm:GetCurrentProject()
if not project then
    result("Project is open", false, "Open (or create) a test project, then run this again.")
    flush()
    return
end
local mp = project:GetMediaPool()

-- Reuse the spike timeline on a second run; otherwise make a fresh one
local tl = project:GetCurrentTimeline()
local fresh = not (tl and (tl:GetName() or ""):match("^MC_Phase0"))
if fresh then
    local name = "MC_Phase0_" .. os.date("%H%M%S")
    tl = try(function() return mp:CreateEmptyTimeline(name) end)
    if not tl then
        result("Create a test timeline", false, "CreateEmptyTimeline returned nothing")
        flush()
        return
    end
    project:SetCurrentTimeline(tl)
    result("Create a test timeline", true, name)
else
    result("Reuse the test timeline", nil, tl:GetName())
end
try(function() rv:OpenPage("edit") end)

local fps = tonumber(tl:GetSetting("timelineFrameRate"))
local tlStart = tl:GetStartFrame()
result("Read timeline frame rate", fps ~= nil, tostring(fps) .. " fps · start frame " .. tostring(tlStart))
fps = fps or 24

-- Timecode counts at the nominal rate (same rule Srutilekha uses for 23.976)
local tcFps = math.max(1, math.floor(fps + 0.5))
local function tc_of(frame)
    local s = math.floor(frame / tcFps)
    return string.format("%02d:%02d:%02d:%02d", math.floor(s / 3600), math.floor(s / 60) % 60, s % 60, frame % tcFps)
end

local function text_plus_of(item)
    local comp = try(function() return item:GetFusionCompByIndex(1) end)
    if not comp then return nil, nil end
    local list = try(function() return comp:GetToolList(false, "TextPlus") end) or {}
    for _, t in pairs(list) do return comp, t end
    return comp, nil
end

-- ── Part 1: a title inserted at the playhead ───────────────────────────────
if fresh then
    log("")
    log("Part 1 · Text+ through InsertFusionTitleIntoTimeline")
    try(function() tl:SetCurrentTimecode(tc_of(tlStart)) end)
    local item, err = try(function() return tl:InsertFusionTitleIntoTimeline("Text+") end)
    result("1a Insert a Text+ title", item ~= nil, item
        and ("start " .. item:GetStart() .. " · default length " .. item:GetDuration() .. " frames")
        or tostring(err))

    if item then
        local props = try(function() return item:GetProperty() end)
        if type(props) == "table" then
            local keys = {}
            for k in pairs(props) do keys[#keys + 1] = k end
            table.sort(keys)
            result("1b TimelineItem properties", nil, table.concat(keys, ", "))
        end
        local mpi = try(function() return item:GetMediaPoolItem() end)
        result("1c Title has a Media Pool item", nil, mpi and (mpi:GetName() or "unnamed") or "no")

        local comp, tp = text_plus_of(item)
        result("2a Open the title's Fusion comp", comp ~= nil, comp and ("comps on item: " .. tostring(item:GetFusionCompCount())))
        result("2b Find its Text+ tool", tp ~= nil, tp and tp.Name)

        if comp and tp then
            local a = comp:GetAttrs()
            local s0 = a.COMPN_RenderStart or 0
            log("     comp frames " .. tostring(a.COMPN_RenderStart) .. "–" .. tostring(a.COMPN_RenderEnd)
                .. " · global start " .. tostring(a.COMPN_GlobalStart))

            try(function() tp:SetInput("StyledText", "MotionCaption Phase 0") end)
            local txt = try(function() return tp:GetInput("StyledText") end)
            result("2c Set the caption text", txt == "MotionCaption Phase 0", txt)

            -- Three Size keys: small -> overshoot -> settle (a "pop")
            local ok, kerr = pcall(function()
                comp:Lock()
                tp:AddModifier("Size", "BezierSpline")
                tp:SetInput("Size", 0.02, s0)
                tp:SetInput("Size", 0.12, s0 + 12)
                tp:SetInput("Size", 0.08, s0 + 20)
                comp:Unlock()
            end)
            if not ok then try(function() comp:Unlock() end) end
            local v0 = try(function() return tp:GetInput("Size", s0) end)
            local v1 = try(function() return tp:GetInput("Size", s0 + 12) end)
            local v2 = try(function() return tp:GetInput("Size", s0 + 20) end)
            local mid = try(function() return tp:GetInput("Size", s0 + 6) end)
            local keyed = ok and near(v0, 0.02) and near(v1, 0.12) and near(v2, 0.08)
            result("2d Three Size keyframes (pop)", keyed,
                ok and string.format("f%d=%.3f  f%d=%.3f  f%d=%.3f", s0, v0 or -1, s0 + 12, v1 or -1, s0 + 20, v2 or -1) or tostring(kerr))
            result("2e Values interpolate between keys", type(mid) == "number" and mid > 0.02 and mid < 0.12,
                type(mid) == "number" and string.format("f%d=%.3f", s0 + 6, mid) or "no value")

            -- Letter spacing closing in (the cinematic "Subtle Tracking")
            local okT, terr = pcall(function()
                comp:Lock()
                tp:AddModifier("CharacterSpacing", "BezierSpline")
                tp:SetInput("CharacterSpacing", 1.45, s0)
                tp:SetInput("CharacterSpacing", 1.0, s0 + 24)
                comp:Unlock()
            end)
            if not okT then try(function() comp:Unlock() end) end
            local c0 = try(function() return tp:GetInput("CharacterSpacing", s0) end)
            result("2f Letter-spacing keyframes", okT and near(c0, 1.45), okT and string.format("start %.2f", c0 or -1) or tostring(terr))

            -- Which inputs exist for opacity, softness, colour, transform, per-word work
            local found, total = {}, 0
            for _, inp in pairs(try(function() return tp:GetInputList() end) or {}) do
                total = total + 1
                local at = try(function() return inp:GetAttrs() end) or {}
                local id = at.INPS_ID or ""
                if id:match("Opacity") or id:match("Soft") or id:match("^Red1") or id:match("^Alpha1")
                    or id:match("Rotation") or id:match("Angle") or id:match("Transform") or id:match("Center")
                    or id:match("Word") or id:match("Line") or id:match("Character") or id:match("Element") then
                    found[#found + 1] = id .. "=" .. tostring(at.INPS_Name)
                end
            end
            result("2g Text+ inputs found", nil, total .. " total")
            for i = 1, math.min(#found, 80) do log("       " .. found[i]) end

            -- The "selected words" layer: second Text+ merged over the caption, fading in late
            local t2, mg, mo
            local okL, lerr = pcall(function()
                comp:Lock()
                t2 = comp:AddTool("TextPlus", -32768, -32768)
                t2:SetInput("StyledText", "WORD LAYER")
                t2:SetInput("Size", 0.06)
                t2:SetInput("Center", { 0.5, 0.32 })
                mg = comp:AddTool("Merge", -32768, -32768)
                for _, t in pairs(comp:GetToolList(false, "MediaOut") or {}) do mo = t break end
                mg:ConnectInput("Background", tp)
                mg:ConnectInput("Foreground", t2)
                mo:ConnectInput("Input", mg)
                -- AddModifier drops a key at the current frame with the current value (1),
                -- so frame s0 must be set explicitly or the layer shows from the start
                mg:AddModifier("Blend", "BezierSpline")
                mg:SetInput("Blend", 0, s0)
                mg:SetInput("Blend", 0, s0 + 10)
                mg:SetInput("Blend", 1, s0 + 22)
                comp:Unlock()
            end)
            if not okL then try(function() comp:Unlock() end) end
            local wired = okL and try(function() return mo.Input:GetConnectedOutput():GetTool().Name end)
            result("3a Second Text+ + Merge wired to the output", okL and wired == (mg and mg.Name),
                okL and ("MediaOut <- " .. tostring(wired)) or tostring(lerr))
            local b0 = okL and try(function() return mg:GetInput("Blend", s0 + 10) end)
            local b1 = okL and try(function() return mg:GetInput("Blend", s0 + 22) end)
            result("3b Word layer fades in on its own keys", near(b0, 0) and near(b1, 1),
                string.format("blend %s -> %s", tostring(b0), tostring(b1)))

            -- Template fallback: save the Text+ as a .setting file
            local p1 = OUT .. "MC_Phase0_TextPlus.setting"
            os.remove(p1)
            local saved = try(function() return tp:SaveSettings(p1) end)
            local n1 = file_size(p1)
            result("4a Save Text+ as a .setting file", n1 ~= nil and n1 > 0, n1 and (p1 .. " · " .. n1 .. " bytes") or tostring(saved))
            if t2 and mg then
                local p2 = OUT .. "MC_Phase0_WordLayer.setting"
                os.remove(p2)
                local st = try(function() return comp:CopySettings({ tp, t2, mg }) end)
                local wrote = st and try(function() return bmd.writefile(p2, st) end)
                local n2 = file_size(p2)
                result("4b Save the 3-node group as one .setting", n2 ~= nil and n2 > 0, n2 and (n2 .. " bytes") or "CopySettings/writefile not available")
            end
        end

        -- A second title placed at an exact frame (5 s in)
        local target = tlStart + 5 * tcFps
        try(function() tl:SetCurrentTimecode(tc_of(target)) end)
        local item2 = try(function() return tl:InsertFusionTitleIntoTimeline("Text+") end)
        result("1d Second title lands on the playhead frame", item2 ~= nil and item2:GetStart() == target,
            item2 and ("wanted " .. target .. " · got " .. item2:GetStart()) or "insert failed")
        if item2 then
            local _, t = text_plus_of(item2)
            if t then try(function() t:SetInput("StyledText", "Placed at 5 s") end) end
        end
    end
end

-- ── Part 2: exact caption length from a Media Pool title ───────────────────
log("")
log("Part 2 · exact length with AppendToTimeline")
local template
local function scan(folder, depth)
    if not folder or depth > 2 then return end
    -- Resolve's Lua tables are not always {index = object}; take whichever side is the object
    for k, v in pairs(try(function() return folder:GetClipList() end) or {}) do
        local clip = type(v) ~= "number" and v or k
        local ty = tostring(try(function() return clip:GetClipProperty("Type") end) or "")
        log("     media pool: " .. tostring(try(function() return clip:GetName() end)) .. "  [" .. ty .. "]  (" .. type(k) .. "/" .. type(v) .. ")")
        if not template and (ty:match("Fusion") or ty:match("Title") or ty:match("Generator")) then template = clip end
    end
    for k, v in pairs(try(function() return folder:GetSubFolderList() end) or {}) do scan(type(v) ~= "number" and v or k, depth + 1) end
end
scan(mp:GetRootFolder(), 0)

if not template then
    result("5 Exact caption length", nil,
        "Not tested yet. Drag the first “MotionCaption Phase 0” title from the timeline into the Media Pool, then run this script again.")
else
    local before = tl:GetTrackCount("video")
    try(function() tl:AddTrack("video") end)
    local track = tl:GetTrackCount("video")
    local rec1, rec2 = tlStart + 10 * tcFps, tlStart + 12 * tcFps
    local items = try(function()
        return mp:AppendToTimeline({
            { mediaPoolItem = template, startFrame = 0, endFrame = 44, recordFrame = rec1, trackIndex = track },
            { mediaPoolItem = template, startFrame = 0, endFrame = 89, recordFrame = rec2, trackIndex = track },
        })
    end)
    local n = type(items) == "table" and #items or 0
    result("5a Append a title with a chosen length", n == 2, "template “" .. tostring(template:GetName()) .. "” · items " .. n .. " · track V" .. track)
    if n == 2 then
        local d1, d2 = items[1]:GetDuration(), items[2]:GetDuration()
        result("5b Lengths match the request (45 and 90 frames)", (d1 == 45 or d1 == 44) and (d2 == 90 or d2 == 89),
            "got " .. d1 .. " and " .. d2 .. " · starts " .. items[1]:GetStart() .. ", " .. items[2]:GetStart())
        result("5c Starts land on the requested frames", items[1]:GetStart() == rec1 and items[2]:GetStart() == rec2,
            "wanted " .. rec1 .. ", " .. rec2)
        for i, it in ipairs(items) do
            local _, t = text_plus_of(it)
            result("5d Appended title " .. i .. " is editable Text+", t ~= nil)
            if t then try(function() t:SetInput("StyledText", i == 1 and "45 frames" or "90 frames") end) end
        end
    end
    if before == track then log("     (no new track was added; used V" .. track .. ")") end
end

end

local okMain, errMain = pcall(main)
if not okMain then result("Script stopped early", false, errMain) end

-- ── Summary ────────────────────────────────────────────────────────────────
local pass, fail = 0, 0
for _, r in ipairs(results) do
    if r.ok == true then pass = pass + 1 elseif r.ok == false then fail = fail + 1 end
end
log(string.rep("-", 60))
log(string.format("Summary: %d passed · %d failed", pass, fail))
log("Now look at the Edit page viewer:")
log("  · Scrub the first title: the text should grow, overshoot and settle in under a second.")
log("  · “WORD LAYER” should fade in a little later, below it.")
log("Log file: " .. LOG)
flush()
pcall(function() bmd.openfileexternal("Open", LOG) end)
