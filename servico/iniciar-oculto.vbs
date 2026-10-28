' Arranca executar.cmd sem abrir janela (apenas se ainda nao estiver a correr)
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set ja = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='cmd.exe' AND CommandLine LIKE '%executar.cmd%'")
If ja.Count > 0 Then WScript.Quit
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & pasta & "\executar.cmd""", 0, False
