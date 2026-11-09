-- MotionCaption · Spike 4  (Workspace -> Scripts -> MotionCaption_Spike4)
--
-- The frame rate test (2026-11-08) found:
--   * AppendToTimeline reads endFrame in the template clip's own frame rate (24) and
--     converts it: on a 25 fps timeline 60 became 62, on 60 fps 144 became 360.
--   * SetSetting("timelineFrameRate", "23.976" / "29.97" / "59.94") is refused.
-- This finds the fix:
--   I  the template clip's properties (its FPS)
--   N  which text Resolve takes for NTSC timeline rates
--   L  exact caption lengths at other rates, three ways:
--        int    endFrame = round(len × templateFps / rate)   (shows the rounding loss)
--        float  endFrame = len × templateFps / rate          (unrounded)
--        copy   a template copy with its FPS set to the rate, endFrame = len
--
-- Everything it makes (timelines, a "MC_Spike4" bin) is deleted at the end.
-- Nothing else in the project changes. The project is not saved.

local BASE = (os.getenv("APPDATA") or os.getenv("TEMP") or ".") .. "\\MotionCaption\\"
local LOG = BASE .. "spike4.log"
local DRB = BASE .. "Template.drb"
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

local function objects(t)
    local out = {}
    for k, v in pairs(t or {}) do
        if type(v) == "userdata" then out[#out + 1] = v
        elseif type(k) == "userdata" then out[#out + 1] = k end
    end
    return out
end

local function dump(v)
    if type(v) ~= "table" then return tostring(v) end
    local parts = {}
    for k, x in pairs(v) do parts[#parts + 1] = tostring(k) .. "=" .. tostring(x) end
    table.sort(parts)
    return "{" .. table.concat(parts, ", ") .. "}"
end

local function rate_num(s)
    local n = tonumber(tostring(s or ""):match("^%s*([%d%.]+)"))
    if not n then return nil end
    for _, r in ipairs({ 24, 30, 48, 60, 120 }) do
        if math.abs(n - r * 1000 / 1001) < 0.01 then return r * 1000 / 1001 end
    end
    return n
end

local rv = resolve or (fusion and fusion:GetResolve())
if not rv then print("[MotionCaption] This scripting host has no Resolve object.") return end

log("MotionCaption Spike 4 · " .. os.date("%Y-%m-%d %H:%M:%S") .. " · Resolve " .. tostring(try(function() return rv:GetVersionString() end)))

local made, bin = {}, nil

local function main()
    local project = rv:GetProjectManager():GetCurrentProject()
    if not project then log("FAIL  Open a project first.") return end
    local mp = project:GetMediaPool()
    local root = mp:GetRootFolder()
    local stamp = os.date("%H%M%S")
    local was = project:GetCurrentTimeline()

    log(string.format("Project: %s fps, %sx%s", tostring(project:GetSetting("timelineFrameRate")),
        tostring(project:GetSetting("timelineResolutionWidth")), tostring(project:GetSetting("timelineResolutionHeight"))))
    if was then
        log(string.format("Current timeline %s: %s fps, %sx%s, custom %s", was:GetName(), tostring(was:GetSetting("timelineFrameRate")),
            tostring(was:GetSetting("timelineResolutionWidth")), tostring(was:GetSetting("timelineResolutionHeight")),
            tostring(was:GetSetting("useCustomSettings"))))
    end

    -- ── I  The template ────────────────────────────────────────────────────
    -- The .drb import puts the title in a folder inside the bin, so look down a few levels
    local template
    local function find_title(folder, depth)
        if not folder or depth > 3 or template then return end
        for _, c in ipairs(objects(try(function() return folder:GetClipList() end))) do
            if tostring(c:GetClipProperty("Type")):match("Fusion Title") then template = c; return end
        end
        for _, s in ipairs(objects(try(function() return folder:GetSubFolderList() end))) do find_title(s, depth + 1) end
    end
    for _, sub in ipairs(objects(root:GetSubFolderList())) do
        if sub:GetName() == "MotionCaption" then find_title(sub, 0) end
    end
    if not template then log("FAIL  No Text+ in the MotionCaption bin. Run MotionCaption once first.") return end
    log("")
    log("── I  Template clip properties")
    log(dump(try(function() return template:GetClipProperty() end)))
    local tFps = rate_num(template:GetClipProperty("FPS")) or 24
    log("Template FPS → " .. tFps)

    -- A copy of the template for each rate, in its own bin
    bin = try(function() return mp:AddSubFolder(root, "MC_Spike4") end)
    local function template_copy(rate)
        if not bin then return nil, "no bin" end
        local before = {}
        for _, c in ipairs(objects(bin:GetClipList())) do before[c] = true end
        local cur = try(function() return mp:GetCurrentFolder() end)
        mp:SetCurrentFolder(bin)
        local ok = try(function() return mp:ImportFolderFromFile(DRB) end)
        if cur then mp:SetCurrentFolder(cur) end
        local copy
        local function scan(f, d)
            if d > 2 or copy then return end
            for _, c in ipairs(objects(f:GetClipList())) do
                if not before[c] and tostring(c:GetClipProperty("Type")):match("Fusion Title") then copy = c end
            end
            for _, s in ipairs(objects(f:GetSubFolderList())) do scan(s, d + 1) end
        end
        scan(bin, 0)
        if not copy then return nil, "import " .. tostring(ok) .. " gave no title" end
        local set = try(function() return copy:SetClipProperty("FPS", rate) end)
        return copy, string.format("import %s · SetClipProperty FPS %s → %s · reads %s", tostring(ok), rate, tostring(set),
            tostring(copy:GetClipProperty("FPS")))
    end

    -- ── N  NTSC rate text ──────────────────────────────────────────────────
    log("")
    log("── N  Which text sets an NTSC timeline rate")
    local works = {}
    local CANDIDATES = {
        { want = "23.976", tries = { "23.976", "23.98", "23.976 fps", "24000/1001" } },
        { want = "29.97",  tries = { "29.97", "29.97 DF", "29.97 NDF", "30000/1001" } },
        { want = "59.94",  tries = { "59.94", "59.94 DF", "59.94 NDF", "60000/1001" } },
    }
    for _, c in ipairs(CANDIDATES) do
        for _, txt in ipairs(c.tries) do
            for _, order in ipairs({ "custom first", "rate first", "with playback rate" }) do
                local tl = try(function() return mp:CreateEmptyTimeline("MC_S4_N_" .. stamp .. "_" .. #made) end)
                if tl then
                    made[#made + 1] = tl
                    local r1, r2, r3
                    if order == "rate first" then
                        r2 = try(function() return tl:SetSetting("timelineFrameRate", txt) end)
                        r1 = try(function() return tl:SetSetting("useCustomSettings", "1") end)
                        r2 = r2 or try(function() return tl:SetSetting("timelineFrameRate", txt) end)
                    else
                        r1 = try(function() return tl:SetSetting("useCustomSettings", "1") end)
                        if order == "with playback rate" then
                            r3 = try(function() return tl:SetSetting("timelinePlaybackFrameRate", txt) end)
                        end
                        r2 = try(function() return tl:SetSetting("timelineFrameRate", txt) end)
                    end
                    local got = tl:GetSetting("timelineFrameRate")
                    local ok = rate_num(got) and math.abs(rate_num(got) - rate_num(c.want)) < 0.001
                    log(string.format("%s  %-12s %-18s custom=%s rate=%s playback=%s → reads %s, DF %s", ok and "PASS" or "    ",
                        '"' .. txt .. '"', order, tostring(r1), tostring(r2), tostring(r3), tostring(got),
                        tostring(tl:GetSetting("timelineDropFrameTimecode"))))
                    if ok and not works[c.want] then works[c.want] = { txt = txt, order = order } end
                end
            end
        end
        if not works[c.want] then log("FAIL  No text set " .. c.want) end
    end

    -- ── L  Exact lengths ───────────────────────────────────────────────────
    log("")
    log("── L  Caption lengths (want → got), template at " .. tFps .. " fps")
    local LENS = { 1, 3, 60, 61, 145, 300 }
    local RATES = { "25", "30", "60" }
    for _, w in pairs(works) do RATES[#RATES + 1] = w.txt end
    for _, rateTxt in ipairs(RATES) do
        local tl = try(function() return mp:CreateEmptyTimeline("MC_S4_L_" .. stamp .. "_" .. #made) end)
        if tl then
            made[#made + 1] = tl
            project:SetCurrentTimeline(tl)
            try(function() tl:SetSetting("useCustomSettings", "1") end)
            try(function() tl:SetSetting("timelineFrameRate", rateTxt) end)
            local got = tl:GetSetting("timelineFrameRate")
            local r = rate_num(got)
            local start = tl:GetStartFrame()
            log("")
            log(string.format("%s fps (asked %s), starts %d", tostring(got), rateTxt, start))
            local copy, info = template_copy(rateTxt)
            log("      copy: " .. tostring(info))

            local methods = {
                { name = "int",   clip = template, len = function(L) return math.floor(L * tFps / r + 0.5) end },
                { name = "float", clip = template, len = function(L) return L * tFps / r end },
                { name = "copy",  clip = copy,     len = function(L) return L end },
            }
            for mi, m in ipairs(methods) do
                try(function() tl:AddTrack("video") end)
                local track = tl:GetTrackCount("video")
                local row, exact = {}, 0
                if m.clip then
                    for li, L in ipairs(LENS) do
                        local rec = start + li * 400
                        local items = try(function() return mp:AppendToTimeline({ { mediaPoolItem = m.clip, startFrame = 0,
                            endFrame = m.len(L), recordFrame = rec, trackIndex = track } }) end)
                        local it = items and objects(items)[1]
                        local st, du = it and try(function() return it:GetStart() end), it and try(function() return it:GetDuration() end)
                        if st == rec and du == L then exact = exact + 1 end
                        row[#row + 1] = string.format("%d→%s%s", L, tostring(du), st == rec and "" or ("@" .. tostring(st and st - rec)))
                    end
                end
                log(string.format("%s  %-6s %d/%d exact   %s", exact == #LENS and "PASS" or "    ", m.name, exact, #LENS,
                    m.clip and table.concat(row, "  ") or "no clip"))
            end
        end
    end
    if was then project:SetCurrentTimeline(was) end
end

local ok, err = pcall(main)
if not ok then log("FAIL  Stopped early: " .. tostring(err)) end

-- Clean up everything this made
local project = try(function() return rv:GetProjectManager():GetCurrentProject() end)
local mp = project and project:GetMediaPool()
if mp then
    local del = #made > 0 and try(function() return mp:DeleteTimelines(made) end)
    local delBin = bin and try(function() return mp:DeleteFolders({ bin }) end)
    log("")
    log(string.format("Cleanup: %d test timelines deleted → %s, MC_Spike4 bin → %s", #made, tostring(del), tostring(delBin)))
end
log("Done.")

local f = io.open(LOG, "wb")
if f then f:write(table.concat(lines, "\n"), "\n"); f:close() end
pcall(function() bmd.openfileexternal("Open", LOG) end)
