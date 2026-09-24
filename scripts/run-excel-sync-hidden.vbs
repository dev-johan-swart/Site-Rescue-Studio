Option Explicit

Dim shell, repoRoot, scriptPath, powershell, command, exitCode

Set shell = CreateObject("WScript.Shell")

repoRoot = "C:\Users\Administrator\OneDrive\Desktop\JS Dev Studio\JS Dev Solution\Site Rescue Studio"
scriptPath = repoRoot & "\scripts\run-excel-sync.ps1"
powershell = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"

command = Chr(34) & powershell & Chr(34) & _
          " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & _
          Chr(34) & scriptPath & Chr(34)

exitCode = shell.Run(command, 0, True)

WScript.Quit exitCode
