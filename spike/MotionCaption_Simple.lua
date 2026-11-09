-- MotionCaption · Simple  (Workspace -> Scripts -> MotionCaption_Simple)
--
-- The "Simple Studio" mockup as a window inside DaVinci Resolve: your timeline's subtitles
-- on the left, a preview of the look in the middle, six plain choices on the right.
-- It only reads the timeline; nothing is placed or changed.
--
-- Script windows need Resolve's UI Manager. Resolve Free 21 did not have one in bridge test 6
-- (fusion.UIManager was nil), so this tries every known way to reach it first. Without it,
-- it opens the same design in the browser instead and writes why to simple_probe.txt.

local BASE = (os.getenv("APPDATA") or os.getenv("TEMP") or ".") .. "\\MotionCaption\\"
local MOCKUP = "D:\\AI Automation\\SRT Animation\\MotionCaption\\mockups\\simple.html"

local function try(fn, ...) local ok, a = pcall(fn, ...); if ok then return a end end
local function write_file(p, s) local f = io.open(p, "wb"); if f then f:write(s); f:close() end end
local function objects(t)
    local out = {}
    for k, v in pairs(t or {}) do
        if type(v) == "userdata" then out[#out + 1] = v elseif type(k) == "userdata" then out[#out + 1] = k end
    end
    return out
end

local rv = resolve or (fusion and try(function() return fusion:GetResolve() end))

-- ── Find the UI Manager ────────────────────────────────────────────────────
local probes, ui = {}, nil
local function probe(name, get)
    local v = try(get)
    probes[#probes + 1] = name .. "=" .. tostring(v ~= nil)
    if v ~= nil and not ui then ui = v end
end
probe("fusion.UIManager", function() return fusion.UIManager end)
probe("fu.UIManager", function() return fu.UIManager end)
probe("app.UIManager", function() return app.UIManager end)
probe("resolve:Fusion().UIManager", function() return rv:Fusion().UIManager end)
probe("fusion:GetUIManager()", function() return fusion:GetUIManager() end)
probe("bmd.UIManager", function() return bmd.UIManager end)
local dispOk = try(function() return bmd.UIDispatcher ~= nil end)
probes[#probes + 1] = "bmd.UIDispatcher=" .. tostring(dispOk == true)

if not ui or not dispOk then
    write_file(BASE .. "simple_probe.txt", os.date("%Y-%m-%d %H:%M:%S") .. "  No UI Manager, so no window.\n" .. table.concat(probes, "\n") .. "\n")
    print("[MotionCaption] This Resolve has no UI Manager for script windows (Studio only in Resolve 19.1+?). Opening the design in the browser.")
    try(function() bmd.openfileexternal("Open", MOCKUP) end)
    return
end
write_file(BASE .. "simple_probe.txt", os.date("%Y-%m-%d %H:%M:%S") .. "  UI Manager found, window opened.\n" .. table.concat(probes, "\n") .. "\n")

-- ── The timeline's subtitles ───────────────────────────────────────────────
local cues, tlName = {}, "No timeline open"
local project = rv and try(function() return rv:GetProjectManager():GetCurrentProject() end)
local tl = project and try(function() return project:GetCurrentTimeline() end)
if tl then
    tlName = tl:GetName()
    local fps = tonumber(tostring(tl:GetSetting("timelineFrameRate")):match("[%d%.]+")) or 24
    local start = tl:GetStartFrame()
    for i = 1, (tl:GetTrackCount("subtitle") or 0) do
        for _, it in ipairs(objects(try(function() return tl:GetItemListInTrack("subtitle", i) end))) do
            local s = try(function() return it:GetStart() end) or start
            local sec = (s - start) / fps
            cues[#cues + 1] = { t = string.format("%02d:%02d", math.floor(sec / 60), math.floor(sec % 60)), s = s, text = try(function() return it:GetName() end) or "" }
        end
        if #cues > 0 then break end
    end
    table.sort(cues, function(a, b) return a.s < b.s end)
end
if #cues == 0 then
    cues = { { t = "00:00", text = "Every moment is a possibility" }, { t = "00:02", text = "But the right time is now" }, { t = "00:04", text = "Make it count" } }
end

-- ── Look ───────────────────────────────────────────────────────────────────
local ANIMS = { "Pop", "Rise", "Fade", "Typewriter", "Blur", "Bounce" }
local FONTS = { { "Clean", "Segoe UI" }, { "Bold", "Arial Black" }, { "Serif", "Georgia" }, { "Impact", "Impact" } }
local COLOURS = { { "White", "#ffffff" }, { "Gold", "#ffd23f" }, { "Coral", "#ff5a36" }, { "Mint", "#3fcf8e" }, { "Sky", "#4c8dff" } }
local BOXES = { "None", "Dark box", "Colour box" }
local PLACES = { "Top", "Middle", "Bottom" }
local S = { anim = 1, font = 1, size = 22, colour = 1, box = 1, place = 3, cue = 1 }

local disp = bmd.UIDispatcher(ui)
local ACC = "background-color:#ff5a36; color:white; border-radius:6px; padding:6px 14px; font-weight:bold;"
local CHIP = "background-color:#1b1e24; color:#a6abb8; border:1px solid #2c303a; border-radius:6px; padding:5px 10px;"
local CHIP_ON = "background-color:#3a2420; color:white; border:1px solid #ff5a36; border-radius:6px; padding:5px 10px;"

local function chips(prefix, list, label)
    local row = {}
    for i, v in ipairs(list) do row[#row + 1] = ui:Button({ ID = prefix .. i, Text = type(v) == "table" and v[1] or v, Flat = true }) end
    return ui:VGroup({ Weight = 0, ui:Label({ Text = label, StyleSheet = "color:#6f7483; font-weight:bold;" }), ui:HGroup(row) })
end

local win = disp:AddWindow({
    ID = "MCSimple", WindowTitle = "MotionCaption · Simple", Geometry = { 120, 90, 1080, 640 },
    StyleSheet = "background-color:#0d0e12; color:#eceef3;",
}, ui:VGroup({
    ui:HGroup({ Weight = 0,
        ui:Label({ Text = "<b>MotionCaption</b> &nbsp; <span style='color:#3fcf8e'>●</span> " .. tlName .. " · " .. #cues .. " captions", Weight = 1 }),
        ui:Button({ ID = "Refresh", Text = "↻ Refresh", Weight = 0, StyleSheet = CHIP }),
        ui:Button({ ID = "Send", Text = "Send to Resolve", Weight = 0, StyleSheet = ACC }),
    }),
    ui:HGroup({
        ui:VGroup({ Weight = 0.32,
            ui:Label({ Text = "Captions · click to preview", Weight = 0, StyleSheet = "color:#6f7483;" }),
            ui:Tree({ ID = "List", HeaderHidden = true, ColumnCount = 2, StyleSheet = "background-color:#15171c; border:1px solid #262a33;" }),
        }),
        ui:VGroup({ Weight = 0.38,
            ui:Label({ ID = "Preview", Alignment = { AlignHCenter = true, AlignVCenter = true }, WordWrap = true,
                StyleSheet = "background-color:#2a2d38; border-radius:12px; padding:20px;" }),
            ui:Label({ ID = "Info", Weight = 0, Alignment = { AlignHCenter = true }, StyleSheet = "color:#6f7483;" }),
        }),
        ui:VGroup({ Weight = 0.30, Spacing = 10,
            ui:VGroup({ Weight = 0, ui:Label({ Text = "ANIMATION", StyleSheet = "color:#6f7483; font-weight:bold;" }), ui:ComboBox({ ID = "Anim" }) }),
            chips("Font", FONTS, "FONT"),
            ui:VGroup({ Weight = 0, ui:Label({ ID = "SizeLbl", Text = "SIZE", StyleSheet = "color:#6f7483; font-weight:bold;" }),
                ui:Slider({ ID = "Size", Minimum = 14, Maximum = 40, Value = S.size, Orientation = "Horizontal" }) }),
            chips("Col", COLOURS, "COLOUR"),
            chips("Box", BOXES, "BACKGROUND"),
            chips("Place", PLACES, "POSITION"),
            ui:Label({ Weight = 1, WordWrap = true, Text = "Changes apply to all captions. This window only previews: Send uses the MotionCaption app.", StyleSheet = "color:#6f7483;" }),
        }),
    }),
}))

local items = win:GetItems()
for _, a in ipairs(ANIMS) do items.Anim:AddItem(a) end
for i, c in ipairs(cues) do
    local it = items.List:NewItem()
    it.Text[0] = c.t
    it.Text[1] = c.text
    items.List:AddTopLevelItem(it)
end
try(function() items.List.ColumnWidth[0] = 54 end)

local function esc(s) return (s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;")) end
local function paint()
    local font, colour = FONTS[S.font][2], COLOURS[S.colour][2]
    local text = esc(cues[S.cue] and cues[S.cue].text or "")
    local bg = S.box == 2 and "background-color:rgba(10,10,14,0.8);" or S.box == 3 and "background-color:#ff5a36;" or ""
    local body = string.format("<span style=\"font-family:'%s'; font-size:%dpx; font-weight:900; color:%s; %s padding:4px 10px;\">%s</span>",
        font, S.size, colour, bg, text)
    local gap = S.place == 1 and "<br><br><br><br><br><br><br><br>" or S.place == 2 and "<br><br><br><br>" or ""
    items.Preview.Text = (S.place == 3 and "<br><br><br><br><br><br><br><br>" or "") .. body .. gap
    local v = S.place == 1 and "AlignTop" or S.place == 2 and "AlignVCenter" or "AlignBottom"
    items.Preview.Alignment = { AlignHCenter = true, [v] = true }
    items.Info.Text = string.format("Caption %d of %d · %s · %s", S.cue, #cues, ANIMS[S.anim], FONTS[S.font][1])
    items.SizeLbl.Text = "SIZE · " .. S.size
    for i = 1, #FONTS do items["Font" .. i].StyleSheet = i == S.font and CHIP_ON or CHIP end
    for i = 1, #COLOURS do items["Col" .. i].StyleSheet = (i == S.colour and CHIP_ON or CHIP) .. " color:" .. COLOURS[i][2] .. ";" end
    for i = 1, #BOXES do items["Box" .. i].StyleSheet = i == S.box and CHIP_ON or CHIP end
    for i = 1, #PLACES do items["Place" .. i].StyleSheet = i == S.place and CHIP_ON or CHIP end
end

function win.On.MCSimple.Close(ev) disp:ExitLoop() end
function win.On.Anim.CurrentIndexChanged(ev) S.anim = (items.Anim.CurrentIndex or 0) + 1; paint() end
function win.On.Size.ValueChanged(ev) S.size = items.Size.Value; paint() end
function win.On.List.ItemClicked(ev)
    local txt = ev.item and ev.item.Text[1]
    for i, c in ipairs(cues) do if c.text == txt then S.cue = i end end
    paint()
end
local function bind(prefix, n, key)
    for i = 1, n do
        win.On[prefix .. i].Clicked = function(ev) S[key] = i; paint() end
    end
end
bind("Font", #FONTS, "font"); bind("Col", #COLOURS, "colour"); bind("Box", #BOXES, "box"); bind("Place", #PLACES, "place")
function win.On.Send.Clicked(ev)
    items.Info.Text = "Send places captions from the MotionCaption app; this window is a preview of the Simple design."
end
function win.On.Refresh.Clicked(ev) items.Info.Text = "Close and run MotionCaption_Simple again to read the timeline anew." end

paint()
win:Show()
disp:RunLoop()
win:Hide()
