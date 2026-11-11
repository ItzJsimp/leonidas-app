; electron-builder picks this file up from the build resources folder.
; It registers the Rust Scribe engine (ADR-0074) so dictation works at login
; and with the app window closed. The engine is a separate process: closing
; the window never stops it, so each install and uninstall stops it first.

!define SCRIBE_ENGINE_EXE "$INSTDIR\resources\scribe-engine\scribe-engine.exe"
!define SCRIBE_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define SCRIBE_RUN_NAME "LeonidasScribeEngine"

!macro customInit
  ; A running engine locks its file, so an update could not replace it.
  nsExec::Exec 'taskkill /F /IM scribe-engine.exe'
  Pop $0
  Sleep 500
!macroend

!macro customInstall
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${IfNot} ${FileExists} "$newStartMenuLink"
      !insertmacro createMenuDirectory
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${EndIf}
  !endif
  nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\update-shortcut-icons.ps1" -InstallDirectory "$INSTDIR" -ExecutableName "${APP_EXECUTABLE_FILENAME}" -IconPath "$INSTDIR\resources\leonidas-shortcut-${VERSION}.ico" -DisplayName "${PRODUCT_NAME}"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Leonidas shortcut icon update failed: $0"
    SetErrorLevel 1
    Abort
  ${EndIf}
  WriteRegStr HKCU "${SCRIBE_RUN_KEY}" "${SCRIBE_RUN_NAME}" '"${SCRIBE_ENGINE_EXE}"'
  Exec '"${SCRIBE_ENGINE_EXE}"'
!macroend

!macro customUnInstall
  nsExec::Exec 'taskkill /F /IM scribe-engine.exe'
  Pop $0
  DeleteRegValue HKCU "${SCRIBE_RUN_KEY}" "${SCRIBE_RUN_NAME}"
!macroend
