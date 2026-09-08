Set shell = CreateObject("WScript.Shell")

shell.CurrentDirectory = "C:\Users\Administrator\OneDrive\Desktop\JS Dev Studio\JS Dev Solution\Site Rescue Studio"

command = """C:\Program Files\nodejs\node.exe"" ""C:\Users\Administrator\OneDrive\Desktop\JS Dev Studio\JS Dev Solution\Site Rescue Studio\lib\neonToExcel.js"" --scheduled"

exitCode = shell.Run(command, 0, True)

WScript.Quit exitCode
