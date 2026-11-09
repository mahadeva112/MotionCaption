; electron-builder includes this in the NSIS installer (build/installer.nsh).
; Setup puts the bridge in DaVinci Resolve's Workspace → Scripts menu and the Text+
; templates where the bridge finds them, so Resolve is ready before the app first opens.
; The app still checks both on every send and copies them again if they differ.
; Per-user install: $APPDATA is the signed-in user's Roaming folder, the one Resolve reads.

!define MC_RESOLVE "$APPDATA\Blackmagic Design\DaVinci Resolve"
!define MC_SCRIPTS "${MC_RESOLVE}\Support\Fusion\Scripts\Utility"
!define MC_DATA "$APPDATA\MotionCaption"

!macro customInstall
  ${IfNot} ${FileExists} "${MC_RESOLVE}\*.*"
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONINFORMATION "DaVinci Resolve was not found on this computer.$\r$\n$\r$\nMotionCaption is installed, and its script is in place. Once you install Resolve (Free or Studio), you will find it under Workspace > Scripts > MotionCaption."
    ${EndIf}
  ${EndIf}

  CreateDirectory "${MC_SCRIPTS}"
  CopyFiles /SILENT "$INSTDIR\resources\MotionCaption.lua" "${MC_SCRIPTS}"
  CreateDirectory "${MC_DATA}\templates"
  CopyFiles /SILENT "$INSTDIR\resources\templates\*.drb" "${MC_DATA}\templates"

  ; Where the app is, so the Resolve script can open it when there is nothing to place.
  ; The app writes this file again on every start.
  FileOpen $0 "${MC_DATA}\app.txt" w
  FileWrite $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  FileClose $0
!macroend

!macro customUnInstall
  ; An update runs the old uninstaller first; keep the files, the new setup replaces them
  ${IfNot} ${isUpdated}
    Delete "${MC_SCRIPTS}\MotionCaption.lua"
    RMDir /r "${MC_DATA}"
  ${EndIf}
!macroend
