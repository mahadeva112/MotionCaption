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
  $win = $A::FromHandle($p.MainWindowHandle)

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

  $ws = Find-Item $win 'Workspace' 5
  if (-not $ws) { 'NO_MENU Workspace'; exit 0 }
  Open-Item $ws
  # Qt opens each submenu as its own top-level popup: search from the desktop
  $desk = $A::RootElement
  $scripts = Find-Item $desk 'Scripts'
  if (-not $scripts) { Close-Item $ws; 'NO_MENU Scripts'; exit 0 }
  Open-Item $scripts
  $mc = Find-Item $desk $Script
  if (-not $mc) { Close-Item $scripts; Close-Item $ws; 'NO_MENU ' + $Script; exit 0 }
  $inv = $null
  if ($mc.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$inv)) { $inv.Invoke() }
  else { Open-Item $mc }
  'OK'
} catch {
  'ERROR ' + $_.Exception.Message
}
