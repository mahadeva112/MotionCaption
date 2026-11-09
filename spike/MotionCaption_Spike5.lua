-- MotionCaption · Spike 5  (Workspace -> Scripts -> MotionCaption_Spike5)
--
-- Spike 4 (2026-11-08): AppendToTimeline converts endFrame from the template clip's own
-- frame rate (24) to the timeline's, rounding down, and SetClipProperty("FPS") is
-- refused. scripts/make_templates.py now writes one Text+ template per rate
-- (%APPDATA%\MotionCaption\templates\Template_<tag>.drb). This checks, per rate:
--   * the imported template reports that FPS
--   * captions come out exactly endFrame long, from 1 frame to a minute
-- NTSC rates have two templates each (24000/1001 and 23.976); the one Resolve itself
-- uses gives exact lengths.
--
-- Run it in a NEW, EMPTY project: NTSC timelines can only be made through the project
-- frame rate, which Resolve only lets a project change before it has any timeline.
-- In a project that already has timelines it still tests 24, 25, 30, 50 and 60, and it
-- never changes that project's settings. Everything it makes is deleted at the end.

local BASE = (os.getenv("APPDATA") or os.getenv("TEMP") or ".") .. "\\MotionCaption\\"
local LOG = BASE .. "spike5.log"
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

local function rate_num(s)
    local n = tonumber(tostring(s or ""):match("^%s*([%d%.]+)"))
    if not n then return nil end
    for _, r in ipairs({ 24, 30, 48, 60, 120 }) do
        if math.abs(n - r * 1000 / 1001) < 0.01 then return r * 1000 / 1001 end
    end
    return n
end

local function exists(p)
    local f = io.open(p, "rb")
    if f then f:close() return true end
    return false
end

-- Templates to try for a timeline rate
local TAGS = {
    ["23.976"] = { "23976", "23976d" }, ["29.97"] = { "2997", "2997d" }, ["59.94"] = { "5994", "5994d" },
}
local function tags_for(rateText)
    local key = tostring(rateText):match("^%s*([%d%.]+)")
    return TAGS[key] or { key }
end

local RATES = { "23.976", "24", "25", "29.97", "30", "50", "59.94", "60" }
local LENS = { 1, 2, 3, 59, 60, 61, 145, 300, 1439 }

local rv = resolve or (fusion and fusion:GetResolve())
if not rv then print("[MotionCaption] This scripting host has no Resolve object.") return end
log("MotionCaption Spike 5 · " .. os.date("%Y-%m-%d %H:%M:%S") .. " · Resolve " .. tostring(try(function() return rv:GetVersionString() end)))

local made, bin = {}, nil

local function main()
    local project = rv:GetProjectManager():GetCurrentProject()
    if not project then log("FAIL  Open a project first.") return end
    local mp = project:GetMediaPool()
    local root = mp:GetRootFolder()
    local stamp = os.date("%H%M%S")
    local fresh = (project:GetTimelineCount() or 0) == 0
    local was = project:GetCurrentTimeline()
    log(string.format("Project %s: %s fps, %d timelines → %s", project:GetName(), tostring(project:GetSetting("timelineFrameRate")),
        project:GetTimelineCount() or -1, fresh and "empty, NTSC rates will be tried" or "has timelines, settings left alone"))
    bin = try(function() return mp:AddSubFolder(root, "MC_Spike5") end)
    if not bin then log("FAIL  Could not make the MC_Spike5 bin") return end

    -- One timeline at a rate. Per-timeline rates work for whole numbers (Spike 4);
    -- NTSC needs the project rate, which only an empty project lets us set.
    local function timeline_at(rate)
        local name = "MC_S5_" .. rate:gsub("%.", "") .. "_" .. stamp
        if fresh then
            local set = try(function() return project:SetSetting("timelineFrameRate", rate) end)
            log(string.format("      project SetSetting %s → %s, reads %s", rate, tostring(set), tostring(project:GetSetting("timelineFrameRate"))))
        end
        local tl = try(function() return mp:CreateEmptyTimeline(name) end)
        if not tl then return nil end
        made[#made + 1] = tl
        if math.abs((rate_num(tl:GetSetting("timelineFrameRate")) or 0) - rate_num(rate)) > 0.001 then
            try(function() tl:SetSetting("useCustomSettings", "1") end)
            try(function() tl:SetSetting("timelineFrameRate", rate) end)
        end
        return tl
    end

    local function import(tag)
        local p = BASE .. "templates\\Template_" .. tag .. ".drb"
        if not exists(p) then return nil, "missing " .. p end
        local sub = try(function() return mp:AddSubFolder(bin, tag) end)
        if not sub then return nil, "no sub-bin" end
        local cur = try(function() return mp:GetCurrentFolder() end)
        mp:SetCurrentFolder(sub)
        local ok = try(function() return mp:ImportFolderFromFile(p) end)
        if cur then mp:SetCurrentFolder(cur) end
        local found
        local function scan(f, d)
            if d > 3 or found then return end
            for _, c in ipairs(objects(f:GetClipList())) do
                if tostring(c:GetClipProperty("Type")):match("Fusion Title") then found = c return end
            end
            for _, s in ipairs(objects(f:GetSubFolderList())) do scan(s, d + 1) end
        end
        scan(sub, 0)
        if not found then return nil, "import " .. tostring(ok) .. " gave no title" end
        return found
    end

    -- Run 2 (2026-11-08): the project rate locks once a timeline exists, so in an empty
    -- project each NTSC rate goes first, and its timelines are deleted before the next,
    -- leaving the project empty again. 23.976 goes last so the project ends there.
    local order = RATES
    if fresh then order = { "29.97", "59.94", "23.976", "24", "25", "30", "50", "60" } end
    local NTSC = { ["23.976"] = true, ["29.97"] = true, ["59.94"] = true }

    local summary = {}
    for _, rate in ipairs(order) do
        log("")
        if fresh and NTSC[rate] and #made > 0 then
            local del = try(function() return mp:DeleteTimelines(made) end)
            log(string.format("      deleted %d test timelines → %s; project now has %s", #made, tostring(del), tostring(project:GetTimelineCount())))
            made = {}
        end
        local tl = timeline_at(rate)
        local got = tl and tl:GetSetting("timelineFrameRate")
        if not tl or math.abs((rate_num(got) or 0) - rate_num(rate)) > 0.001 then
            log(string.format("── %s fps: could not make a timeline at this rate (reads %s)", rate, tostring(got)))
            summary[#summary + 1] = string.format("%-7s no timeline", rate)
        else
            project:SetCurrentTimeline(tl)
            local start = tl:GetStartFrame()
            log(string.format("── %s fps: %s reads %s, DF %s, starts %d", rate, tl:GetName(), tostring(got),
                tostring(tl:GetSetting("timelineDropFrameTimecode")), start))
            for _, tag in ipairs(tags_for(got)) do
                local clip, err = import(tag)
                if not clip then
                    log("FAIL  Template_" .. tag .. ": " .. tostring(err))
                    summary[#summary + 1] = string.format("%-7s %-7s %s", rate, tag, tostring(err))
                else
                    try(function() tl:AddTrack("video") end)
                    local track = tl:GetTrackCount("video")
                    local row, exact = {}, 0
                    for li, L in ipairs(LENS) do
                        local rec = start + li * 2000
                        local items = try(function() return mp:AppendToTimeline({ { mediaPoolItem = clip, startFrame = 0,
                            endFrame = L, recordFrame = rec, trackIndex = track } }) end)
                        local it = items and objects(items)[1]
                        local st = it and try(function() return it:GetStart() end)
                        local du = it and try(function() return it:GetDuration() end)
                        if st == rec and du == L then exact = exact + 1 end
                        row[#row + 1] = string.format("%d→%s%s", L, tostring(du), (st == rec or not st) and "" or ("@" .. (st - rec)))
                    end
                    local line = string.format("%-7s %-7s FPS %-14s %d/%d exact", rate, tag, tostring(clip:GetClipProperty("FPS")), exact, #LENS)
                    log((exact == #LENS and "PASS  " or "      ") .. line .. "   " .. table.concat(row, "  "))
                    summary[#summary + 1] = (exact == #LENS and "PASS  " or "FAIL  ") .. line
                end
            end
        end
    end
    log("")
    log("── Summary")
    for _, s in ipairs(summary) do log(s) end
    if was then try(function() project:SetCurrentTimeline(was) end) end
end

local ok, err = pcall(main)
if not ok then log("FAIL  Stopped early: " .. tostring(err)) end

local project = try(function() return rv:GetProjectManager():GetCurrentProject() end)
local mp = project and project:GetMediaPool()
if mp then
    local del = #made > 0 and try(function() return mp:DeleteTimelines(made) end)
    local delBin = bin and try(function() return mp:DeleteFolders({ bin }) end)
    log("")
    log(string.format("Cleanup: %d test timelines deleted → %s, MC_Spike5 bin → %s", #made, tostring(del), tostring(delBin)))
end
log("Done.")

local f = io.open(LOG, "wb")
if f then f:write(table.concat(lines, "\n"), "\n"); f:close() end
pcall(function() bmd.openfileexternal("Open", LOG) end)
