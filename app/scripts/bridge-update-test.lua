-- Runs the real MotionCaption.lua against a stand-in for Resolve, to check which captions
-- an update leaves alone, removes and makes again (resources/MotionCaption.lua, "What was
-- sent"). No Resolve project is touched: it needs only the Lua that comes with Resolve.
--
--   node scripts/bridge-update-jobs.mts . <work>/jobs        the jobs, made by the app's own code
--   mkdir <work>/run/MotionCaption                           an empty stand-in for %APPDATA%
--   then, with MC_ROOT=<work>/run, MC_BRIDGE=resources/MotionCaption.lua and MC_JOBS=<work>/jobs set:
--   "C:/Program Files/Blackmagic Design/DaVinci Resolve/fuscript.exe" -l lua scripts/bridge-update-test.lua
--
-- Prints one line per send and ends with "N checks, 0 failed".
local env = os.getenv
local ROOT, BRIDGE, JOBS = env("MC_ROOT"), env("MC_BRIDGE"), env("MC_JOBS")
os.getenv = function(k)
    if k == "APPDATA" or k == "LOCALAPPDATA" then return ROOT end
    return env(k)
end
local BASE = ROOT .. "\\MotionCaption\\"
-- What the bridge sees as globals: a stand-in Resolve, and a bmd that never opens the real app or a log
local world = setmetatable({ bmd = { openfileexternal = function() end }, print = function() end }, { __index = _G })

-- ── Stand-ins ──────────────────────────────────────────────────────────────
-- The bridge tells Resolve's objects from plain values by their being userdata
local function obj(m)
    local u = newproxy(true)
    getmetatable(u).__index = function(_, k) return m[k] end
    return u
end
-- A Fusion tool that accepts anything
local any = newproxy(true)
getmetatable(any).__index = function() return any end
getmetatable(any).__call = function() return any end

local START = 86400
local byU = {}
local function new_item(start, len, label)
    local I = { start = start, len = len, label = label, builds = 0 }
    I.comp = obj({ FindTool = function() return any end, GetToolList = function() return {} end,
        Lock = function() end, Unlock = function() end, AddTool = function() return any end })
    I.u = obj({
        GetStart = function() return I.start end, GetEnd = function() return I.start + I.len end,
        GetDuration = function() return I.len end, GetName = function() return label or "Text+" end,
        GetFusionCompCount = function() return 0 end,
        GetFusionCompByIndex = function() I.builds = I.builds + 1; return I.comp end,
        SetClipEnabled = function() return true end, GetClipEnabled = function() return true end,
    })
    byU[I.u] = I
    return I
end

-- The playhead, as Resolve's timecode at 24 fps
local function tc_frame(tc)
    local h, m, sec, f = tostring(tc):match("^(%d+)[:;](%d+)[:;](%d+)[:;](%d+)$")
    return h and ((tonumber(h) * 3600 + tonumber(m) * 60 + tonumber(sec)) * 24 + tonumber(f)) or nil
end

local function new_timeline(name, tracks)
    local T = { name = name, tracks = tracks, overlaps = 0, deleted = 0, tc = "01:00:00:00", underHead = 0 }
    T.u = obj({
        GetName = function() return T.name end,
        GetSetting = function(_, k)
            if k == "timelineFrameRate" then return "24" end
            if k == "timelineDropFrameTimecode" then return "0" end
            return "1080"
        end,
        GetStartFrame = function() return START end,
        GetTrackCount = function(_, kind) return kind == "video" and #T.tracks or (kind == "subtitle" and 1 or 0) end,
        GetTrackName = function(_, kind, i) if kind == "video" then return T.tracks[i] and T.tracks[i].name end return "Subtitle 1" end,
        SetTrackName = function(_, kind, i, n) T.tracks[i].name = n; return true end,
        AddTrack = function() T.tracks[#T.tracks + 1] = { name = "Video " .. (#T.tracks + 1), items = {} }; return true end,
        GetItemListInTrack = function(_, kind, i)
            local out = {}
            if kind == "video" and T.tracks[i] then for _, I in ipairs(T.tracks[i].items) do out[#out + 1] = I.u end end
            return out
        end,
        DeleteClips = function(_, list)
            for _, u in ipairs(list) do
                for _, tr in ipairs(T.tracks) do
                    for j = #tr.items, 1, -1 do
                        if tr.items[j].u == u then table.remove(tr.items, j); T.deleted = T.deleted + 1 end
                    end
                end
            end
            return true
        end,
        SetTrackEnable = function() return true end, GetIsTrackEnabled = function() return true end,
        GetCurrentTimecode = function() return T.tc end,
        SetCurrentTimecode = function(_, tc) if not tc_frame(tc) then return false end T.tc = tc; return true end,
        GetEndFrame = function() return START + 24 * 120 end,
    })
    return T
end

local function new_project(name, timeline)
    -- The project's timelines, the open one, and every timeline opened, by name
    local P = { name = name, tl = timeline, list = { timeline }, cur = timeline, switches = {} }
    local tpl = obj({ GetClipProperty = function(_, k) return k == "Type" and "Fusion Title" or (k == "FPS" and "24" or "") end,
        GetName = function() return "Text+" end })
    local bin = obj({ GetName = function() return "MotionCaption" end, GetClipList = function() return { tpl } end,
        GetSubFolderList = function() return {} end })
    local root = obj({ GetName = function() return "Master" end, GetClipList = function() return {} end,
        GetSubFolderList = function() return { bin } end })
    local mp = obj({
        GetRootFolder = function() return root end,
        CreateEmptyTimeline = function(_, n)
            local T = new_timeline(n, { { name = "Video 1", items = {} } })
            P.list[#P.list + 1] = T
            return T.u
        end,
        DeleteTimelines = function(_, us)
            for _, u in ipairs(us) do
                for j = #P.list, 1, -1 do if P.list[j].u == u then table.remove(P.list, j) end end
            end
            return true
        end,
        AppendToTimeline = function(_, list)
            local out = {}
            for _, info in ipairs(list) do
                local tr = P.tl.tracks[info.trackIndex]
                assert(tr, "append to a track that is not there: " .. tostring(info.trackIndex))
                local s, e = info.recordFrame, info.recordFrame + info.endFrame
                -- A clip placed under the playhead keeps its first render in Resolve
                local head = tc_frame(P.tl.tc)
                if head and head >= s and head < e then P.tl.underHead = P.tl.underHead + 1 end
                for _, I in ipairs(tr.items) do
                    if s < I.start + I.len and e > I.start then P.tl.overlaps = P.tl.overlaps + 1 end
                end
                local I = new_item(info.recordFrame, info.endFrame)
                tr.items[#tr.items + 1] = I
                out[#out + 1] = I.u
            end
            return out
        end,
    })
    P.u = obj({
        GetName = function() return P.name end, GetCurrentTimeline = function() return P.cur.u end,
        GetMediaPool = function() return mp end, GetTimelineCount = function() return #P.list end,
        GetTimelineByIndex = function(_, i) return P.list[i] and P.list[i].u end,
        SetCurrentTimeline = function(_, u)
            for _, T in ipairs(P.list) do
                if T.u == u then P.cur = T; P.switches[#P.switches + 1] = T.name; return true end
            end
            return false
        end,
        GetSetting = function() return "1080" end,
    })
    return P
end

local current
local pm = obj({ GetCurrentProject = function() return current.u end })
world.resolve = obj({ GetProjectManager = function() return pm end, OpenPage = function() return true end,
    GetProductName = function() return "DaVinci Resolve" end, Fusion = function() return nil end })

-- ── Running ────────────────────────────────────────────────────────────────
local function read(p) local f = io.open(p, "rb"); if not f then return nil end local s = f:read("*a"); f:close(); return s end
local function write(p, s) local f = assert(io.open(p, "wb")); f:write(s); f:close() end

local function send(job)
    write(BASE .. "job.lua", assert(read(JOBS .. "\\" .. job .. ".lua"), "no job " .. job))
    os.remove(BASE .. "result.json")
    local ok, err = pcall(setfenv(assert(loadfile(BRIDGE)), world))
    assert(ok, "the bridge stopped: " .. tostring(err))
    local r = read(BASE .. "result.json") or ""
    local n = function(k) return tonumber(r:match('"' .. k .. '":(%-?%d+)')) end
    return { ok = r:find('"ok":true', 1, true) ~= nil, placed = n("placed"), kept = n("kept"), removed = n("removed"), failed = n("failed"), raw = r }
end

-- Every clip on a timeline as "track name@start+len", and the clips themselves by that key
local function snapshot(T)
    local keys, at = {}, {}
    for ti, tr in ipairs(T.tracks) do
        for _, I in ipairs(tr.items) do
            local k = "V" .. ti .. " " .. tr.name .. "@" .. (I.start - START) .. "+" .. I.len
            keys[#keys + 1] = k
            at[k] = I
        end
    end
    table.sort(keys)
    return keys, at
end

local fails, checks = 0, 0
local function check(what, got, want)
    checks = checks + 1
    if got ~= want then
        fails = fails + 1
        print(string.format("  FAIL  %s: got %s, wanted %s", what, tostring(got), tostring(want)))
    end
end
-- How many clips of `before` are still the very same clip, never built again
local function untouched(before, after)
    local n = 0
    for k, I in pairs(before) do if after[k] == I and I.builds == 1 then n = n + 1 end end
    return n
end
local function run(name, job, T, want)
    local _, before = snapshot(T)
    local wasDeleted = T.deleted
    local r = send(job)
    local keys, after = snapshot(T)
    print(string.format("%-34s placed %s · kept %s · removed %s · clips now %d · ok %s", name, tostring(r.placed), tostring(r.kept),
        tostring(r.removed), #keys, tostring(r.ok)))
    check(name .. " ok", r.ok, true)
    check(name .. " placed", r.placed, want.placed)
    check(name .. " kept", r.kept, want.kept)
    check(name .. " deleted in Resolve", T.deleted - wasDeleted, want.removed)
    check(name .. " clips on the timeline", #keys, want.clips)
    check(name .. " clips left untouched", untouched(before, after), want.untouched or want.kept)
    check(name .. " captions on top of another clip", T.overlaps, 0)
    if want.tracks then check(name .. " tracks", #T.tracks, want.tracks) end
    return r, keys, after
end

-- 1. One project, captions on a new track
local A = new_timeline("Timeline 1", { { name = "Video 1", items = { new_item(START, 400, "Interview") } } })
current = new_project("P", A)
run("first send", "first", A, { placed = 6, kept = 0, removed = 0, clips = 7, tracks = 2 })
run("nothing changed", "same", A, { placed = 0, kept = 6, removed = 0, clips = 7, tracks = 2 })
run("one colour changed", "one_colour", A, { placed = 1, kept = 5, removed = 1, clips = 7, tracks = 2 })
run("one text changed", "one_text", A, { placed = 1, kept = 5, removed = 1, clips = 7, tracks = 2 })
run("font changed for all", "all_font", A, { placed = 6, kept = 0, removed = 6, clips = 7, tracks = 2 })
run("one removed, one moved", "removed_and_moved", A, { placed = 1, kept = 4, removed = 2, clips = 6, tracks = 2 })
-- A caption deleted by hand in Resolve comes back; the others stay
table.remove(A.tracks[2].items, 1)
run("one deleted by hand in Resolve", "removed_and_moved_again", A, { placed = 1, kept = 4, removed = 0, clips = 6, tracks = 2 })
-- A caption moved by hand in Resolve is put back where it belongs
A.tracks[2].items[1].start = A.tracks[2].items[1].start + 7
run("one moved by hand in Resolve", "removed_and_moved_again", A, { placed = 1, kept = 4, removed = 1, clips = 6, tracks = 2 })
run("a caption over another", "overlap", A, { placed = 1, kept = 5, removed = 0, clips = 7, tracks = 3 })
run("two tracks, nothing changed", "overlap_again", A, { placed = 0, kept = 6, removed = 0, clips = 7, tracks = 3 })
run("two tracks, one changed", "overlap_one_changed", A, { placed = 1, kept = 5, removed = 1, clips = 7, tracks = 3 })
check("the interview clip is still there", A.tracks[1].items[1].label, "Interview")
check("track names", A.tracks[2].name .. " / " .. A.tracks[3].name, "MC Test / MC Test 2")

-- 2. Another project whose timeline has the same name must not disturb the first one's record
local B = new_timeline("Timeline 1", { { name = "Video 1", items = {} } })
local projA = current
current = new_project("Q", B)
run("other project, first send", "other_project", B, { placed = 6, kept = 0, removed = 0, clips = 6, tracks = 2 })
run("other project, nothing changed", "other_project_again", B, { placed = 0, kept = 6, removed = 0, clips = 6, tracks = 2 })
current = projA
run("back in the first project", "overlap_one_changed", A, { placed = 0, kept = 6, removed = 0, clips = 7, tracks = 3 })

-- 3. A send made by the version before this one (one record for everything, no clip list)
local C = new_timeline("Timeline 1", { { name = "Video 1", items = {} }, { name = "MC Subtitle 1", items = {} } })
for i = 0, 5 do C.tracks[2].items[i + 1] = new_item(START + 24 + i * 48, 36) end
current = new_project("Old", C)
write(BASE .. "last_send.lua", 'return { timeline = "Timeline 1", tracks = { "MC Subtitle 1" }, placed = {  } }')
local old = read(JOBS .. "\\first.lua"):gsub('project = "P"', 'project = "Old"')
write(JOBS .. "\\old_first.lua", old)
write(JOBS .. "\\old_again.lua", (old:gsub('id = "(%d+)', 'id = "9%1')))
run("after an older version's send", "old_first", C, { placed = 6, kept = 0, removed = 6, clips = 6, tracks = 2 })
check("the old track is reused and renamed", C.tracks[2].name, "MC Test")
run("then nothing changed", "old_again", C, { placed = 0, kept = 6, removed = 0, clips = 6, tracks = 2 })

-- 4. Captions on a track of the user's own, where a clip of theirs is in the way of two captions
local D = new_timeline("Timeline 1", { { name = "Video 1", items = {} },
    { name = "B-roll", items = { new_item(START + 70, 90, "city.mp4") } } })
current = new_project("Own", D)
local function own(job) -- the same jobs, for this project
    local name = "own_" .. job
    write(JOBS .. "\\" .. name .. ".lua", (read(JOBS .. "\\" .. job .. ".lua"):gsub('project = "P"', 'project = "Own"')))
    return name
end
run("own track, first send", own("own_track"), D, { placed = 6, kept = 0, removed = 0, clips = 7, tracks = 3 })
check("captions beside the user's clip", #D.tracks[2].items, 5)
check("captions that did not fit, on a new track", #D.tracks[3].items, 2)
run("own track, nothing changed", own("own_track_again"), D, { placed = 0, kept = 6, removed = 0, clips = 7, tracks = 3 })
run("own track, one changed", own("own_track_one_changed"), D, { placed = 1, kept = 5, removed = 1, clips = 7, tracks = 3 })
run("moved from own track to a new one", own("own_to_new"), D, { placed = 6, kept = 0, removed = 6, clips = 7 })
check("the user's clip is still on its track", D.tracks[2].items[1] and D.tracks[2].items[1].label, "city.mp4")
check("nothing else left on the user's track", #D.tracks[2].items, 1)

-- 5. Replace off: a second copy on a new track, the first copy not touched
local E = new_timeline("Timeline 1", { { name = "Video 1", items = {} } })
current = new_project("P", E)
os.remove(BASE .. "last_send.lua")
run("fresh timeline in project P", "first", E, { placed = 6, kept = 0, removed = 0, clips = 6 })
run("replace off", "no_replace", E, { placed = 6, kept = 0, untouched = 6, removed = 0, clips = 12 })

-- 6. A test job left behind that failed: the next click opens the app (not the log) and makes
--    no new test timeline. A real Send that failed is still made again by the next click.
local opened = {}
world.bmd.openfileexternal = function(_, p) opened[#opened + 1] = p end
write(BASE .. "app.txt", BRIDGE) -- any file that is there stands in for the app's exe
local F = new_timeline("Timeline 1", { { name = "Video 1", items = {} } })
current = new_project("P", F)
os.remove(BASE .. "last_send.lua")
local first = read(JOBS .. "\\first.lua")
local testJob = first:gsub('version = 1,', 'version = 1,\n  test = { newTimeline = "MC_Test" },', 1):gsub('id = "(%d+)', 'id = "8%1', 1)
local testId = testJob:match('id = "([^"]+)"')
local failedTest = '{"ok":false,"jobId":"' .. testId .. '","test":true,"errors":["Could not create timeline MC_Test_25"]}'
write(BASE .. "job.lua", testJob)
write(BASE .. "result.json", failedTest)
assert(pcall(setfenv(assert(loadfile(BRIDGE)), world)))
print(string.format("%-34s opened %s · tracks %d", "failed test job left behind", tostring(opened[#opened]), #F.tracks))
check("failed test job: the click opens the app", opened[#opened], BRIDGE)
check("failed test job: result.json is left as it was", read(BASE .. "result.json"), failedTest)
check("failed test job: no new captions or tracks", #F.tracks .. "/" .. #F.tracks[1].items, "1/0")

local firstId = first:match('id = "([^"]+)"')
write(BASE .. "job.lua", first)
write(BASE .. "result.json", '{"ok":false,"jobId":"' .. firstId .. '","errors":["Stopped early"]}')
assert(pcall(setfenv(assert(loadfile(BRIDGE)), world)))
local again = read(BASE .. "result.json") or ""
print(string.format("%-34s placed %s · ok %s", "failed real send, clicked again", again:match('"placed":(%d+)'), tostring(again:find('"ok":true', 1, true) ~= nil)))
check("failed real send: made again", tonumber(again:match('"placed":(%d+)')), 6)
check("failed real send: now ok", again:find('"ok":true', 1, true) ~= nil, true)

-- 7. A super: a caption from the first frame, with the playhead left on it. While captions go
--    in, the playhead waits where no new caption is, then goes back to where it was.
local G = new_timeline("Timeline 1", { { name = "Video 1", items = { new_item(START, 24 * 60, "Interview") } } })
current = new_project("P", G)
os.remove(BASE .. "last_send.lua")
write(JOBS .. "\\super.lua", (first:gsub("startMs = 1000,", "startMs = 0,", 1):gsub('id = "(%d+)', 'id = "7%1', 1)))
G.tc = "01:00:00:00"
run("super from the first frame", "super", G, { placed = 6, kept = 0, removed = 0, clips = 7 })
check("super: no caption placed under the playhead", G.underHead, 0)
check("super: the playhead is back where it was", G.tc, "01:00:00:00")
-- An update that makes the first caption again (now from 1 s) with the playhead on it
G.tc, G.underHead = "01:00:01:12", 0
run("update, playhead on the changed one", "first", G, { placed = 1, kept = 5, removed = 1, clips = 7 })
check("update: no caption placed under the playhead", G.underHead, 0)
check("update: the playhead is back where it was", G.tc, "01:00:01:12")

-- 8. After a send that placed captions, Resolve is made to draw the timeline again: another
--    timeline is opened and left, or with none, an empty one is made for the moment and deleted
local K = new_timeline("Timeline 1", { { name = "Video 1", items = {} } })
current = new_project("P", K)
local PK = current
os.remove(BASE .. "last_send.lua")
run("one timeline in the project", "first", K, { placed = 6, kept = 0, removed = 0, clips = 6 })
check("one timeline: opened an empty one", (PK.switches[1] or ""):match("^MC redraw") ~= nil, true)
check("one timeline: came back", PK.switches[2], "Timeline 1")
check("one timeline: the empty one is deleted", #PK.list, 1)
check("one timeline: it is open again", PK.cur, K)

local L = new_timeline("Timeline 1", { { name = "Video 1", items = {} } })
current = new_project("P", L)
local PL = current
PL.list[2] = new_timeline("Rough cut", { { name = "Video 1", items = {} } })
os.remove(BASE .. "last_send.lua")
run("two timelines in the project", "first", L, { placed = 6, kept = 0, removed = 0, clips = 6 })
check("two timelines: opened the other and came back", table.concat(PL.switches, " > "), "Rough cut > Timeline 1")
check("two timelines: none made or deleted", #PL.list, 2)
run("nothing changed: no redraw", "same", L, { placed = 0, kept = 6, removed = 0, clips = 6 })
check("nothing changed: no timeline opened", #PL.switches, 2)
check("nothing changed: still open", PL.cur, L)

print(string.format("\n%d checks, %d failed", checks, fails))
