' 터미널 창 없이 최신 코드로 치이카와 에이전트를 실행해요 (개발·테스트용)
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & sh.CurrentDirectory & "\node_modules\electron\dist\electron.exe"" .", 0, False
