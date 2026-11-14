# Runs Workspace → Scripts → MotionCaption in DaVinci Resolve, the way a click would.
# Resolve Free cannot be scripted from outside, and its script host has no UI Manager for a
# window that waits (bridge test 6), but its menus are open to Windows UI Automation. So the
# app presses the menu for the user: one Send, nothing to click in Resolve.
# Prints one line: OK, or NO_RESOLVE / NO_MENU <which> / ERROR <message>.
param([string]$Script = 'MotionCaption')
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $A = [System.Windows.Automation.AutomationElement]
  $T = [System.Windows.Automation.TreeScope]
  $C = [System.Windows.Automation.ControlType]

  $p = Get-Process Resolve -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) { 'NO_RESOLVE'; exit 0 }
  # MainWindowHandle can be a menu popup still closing from the last press (Resolve 21.2),
  # which has no Workspace in it: take Resolve's main window itself when it can be found
  $win = $null
  $mine = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $p.Id)
  foreach ($w in $A::RootElement.FindAll($T::Children, $mine)) {
    if ($w.Current.ClassName -eq 'UiMainWindowImp' -or $w.Current.Name -like 'DaVinci Resolve*') { $win = $w; break }
  }
  if (-not $win) { $win = $A::FromHandle($p.MainWindowHandle) }

  function Find-Item($parent, [string]$name, [int]$tries = 20) {
    $cond = New-Object System.Windows.Automation.AndCondition(
      (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $C::MenuItem)),
      (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, $name)))
    for ($i = 0; $i -lt $tries; $i++) {
      $e = $parent.FindFirst($T::Descendants, $cond)
      if ($e) { return $e }
      Start-Sleep -Milliseconds 100
    }
    return $null
  }
  function Open-Item($e) {
    $pat = $null
    if ($e.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pat)) { $pat.Expand() }
    elseif ($e.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pat)) { $pat.Invoke() }
    else { throw "cannot open $($e.Current.Name)" }
  }

  function Close-Item($e) {
    $pat = $null
    try { if ($e.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pat)) { $pat.Collapse() } } catch {}
  }

  # Qt opens each submenu as its own top-level popup: search from the desktop
  $desk = $A::RootElement
  # Right after the script last ran, Resolve 21.2 can still be closing that menu and the
  # Workspace menu then does not open: close what is open and try again
  $miss = 'Workspace'
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    if ($attempt -gt 0) { Start-Sleep -Milliseconds 500 }
    $ws = Find-Item $win 'Workspace' 5
    if (-not $ws) { $miss = 'Workspace'; continue }
    Open-Item $ws
    $scripts = Find-Item $desk 'Scripts'
    if (-not $scripts) { Close-Item $ws; $miss = 'Scripts'; continue }
    Open-Item $scripts
    $mc = Find-Item $desk $Script
    if (-not $mc) { Close-Item $scripts; Close-Item $ws; $miss = $Script; continue }
    $inv = $null
    if ($mc.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$inv)) { $inv.Invoke() }
    else { Open-Item $mc }
    'OK'
    exit 0
  }
  'NO_MENU ' + $miss
} catch {
  'ERROR ' + $_.Exception.Message
}
