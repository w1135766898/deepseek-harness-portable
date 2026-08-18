using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal static class DeepSeekHarnessLauncher
{
    private const string TransactionFileName = ".update-transaction.json";
    private const string UpdateScriptName = "update.ps1";
    private const string RuntimeRelativePath = "runtime\\DeepSeek Harness.exe";
    private const string TempContainerName = "DeepSeekHarnessLauncher";
    private const string WorkerDirectoryPrefix = "worker-";
    private const string WorkerExecutableName = "DeepSeek Harness Launcher Worker.exe";

    private const string WorkerModeVariable = "DSH_GUI_WORKER_MODE";
    private const string WorkerTokenVariable = "DSH_GUI_WORKER_TOKEN";
    private const string WorkerDirectoryVariable = "DSH_GUI_WORKER_DIRECTORY";
    private const string WorkerRootVariable = "DSH_GUI_WORKER_APP_ROOT";
    private const string WorkerParentPidVariable = "DSH_GUI_WORKER_PARENT_PID";
    private const string WorkerParentStartedVariable = "DSH_GUI_WORKER_PARENT_STARTED";
    private const string WorkerArgumentCountVariable = "DSH_GUI_WORKER_ARG_COUNT";
    private const string WorkerArgumentPrefix = "DSH_GUI_WORKER_ARG_";
    private const string GuiLauncherVariable = "DSH_GUI_LAUNCHER";

    private const int ErrorMissingFile = 2;
    private const int ErrorDispatchWorker = 3;
    private const int ErrorWorkerContext = 4;
    private const int ErrorRecovery = 5;
    private const int ErrorStartRuntime = 6;
    private const int EarlyRuntimeExitWindowMilliseconds = 750;
    private const int MoveFileDelayUntilReboot = 0x00000004;

    private const uint MessageBoxOk = 0x00000000;
    private const uint MessageBoxIconError = 0x00000010;
    private const uint MessageBoxSetForeground = 0x00010000;
    private const uint MessageBoxTopMost = 0x00040000;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr window, string text, string caption, uint type);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileExW(string existingFileName, string newFileName, int flags);

    [STAThread]
    public static int Main(string[] arguments)
    {
        try
        {
            if (IsWorkerInvocation())
            {
                return RunWorker();
            }

            return DispatchWorker(arguments == null ? new string[0] : arguments);
        }
        catch (Exception exception)
        {
            ShowError(
                "DeepSeek Harness 启动器发生意外错误。" + Environment.NewLine +
                "The DeepSeek Harness launcher encountered an unexpected error." + Environment.NewLine +
                Environment.NewLine + exception.Message);
            return ErrorDispatchWorker;
        }
    }

    private static bool IsWorkerInvocation()
    {
        if (!String.Equals(Environment.GetEnvironmentVariable(WorkerModeVariable), "1", StringComparison.Ordinal))
        {
            return false;
        }

        try
        {
            string token = Environment.GetEnvironmentVariable(WorkerTokenVariable);
            string suppliedDirectory = Environment.GetEnvironmentVariable(WorkerDirectoryVariable);
            if (!IsHexToken(token) || String.IsNullOrEmpty(suppliedDirectory))
            {
                return false;
            }

            string currentDirectory = NormalizeDirectory(Path.GetDirectoryName(GetExecutablePath()));
            DirectoryInfo current = new DirectoryInfo(currentDirectory);
            return PathsEqual(currentDirectory, suppliedDirectory) &&
                   String.Equals(current.Name, WorkerDirectoryPrefix + token, StringComparison.OrdinalIgnoreCase) &&
                   current.Parent != null &&
                   PathsEqual(current.Parent.FullName, GetTempContainerDirectory());
        }
        catch (Exception)
        {
            return false;
        }
    }

    /*
     * The installed launcher must not stay mapped while a pending update is
     * recovered.  It therefore copies the exact GUI-subsystem executable to a
     * unique directory outside AppRoot, starts that copy, and returns at once.
     * All worker metadata is carried in the environment so the worker does not
     * expose AppRoot in its original process command line.
     */
    private static int DispatchWorker(string[] arguments)
    {
        string workerDirectory = null;
        bool workerStarted = false;

        try
        {
            string executablePath = GetExecutablePath();
            string appRoot = NormalizeDirectory(Path.GetDirectoryName(executablePath));

            string tempContainer = GetTempContainerDirectory();
            string token = Guid.NewGuid().ToString("N");
            workerDirectory = NormalizeDirectory(Path.Combine(tempContainer, WorkerDirectoryPrefix + token));

            if (IsSameOrChildPath(workerDirectory, appRoot))
            {
                throw new InvalidOperationException(
                    "The temporary worker directory resolves inside the application directory: " + workerDirectory);
            }

            Directory.CreateDirectory(workerDirectory);
            string workerExecutable = Path.Combine(workerDirectory, WorkerExecutableName);
            File.Copy(executablePath, workerExecutable, false);

            int parentPid;
            long parentStarted;
            using (Process current = Process.GetCurrentProcess())
            {
                parentPid = current.Id;
                parentStarted = current.StartTime.ToUniversalTime().Ticks;
            }

            ProcessStartInfo startInfo = CreateHiddenStartInfo(workerExecutable, workerDirectory);
            StringDictionary environment = startInfo.EnvironmentVariables;
            RemoveWorkerMetadata(environment);
            environment[WorkerModeVariable] = "1";
            environment[WorkerTokenVariable] = token;
            environment[WorkerDirectoryVariable] = workerDirectory;
            environment[WorkerRootVariable] = appRoot;
            environment[WorkerParentPidVariable] = parentPid.ToString(CultureInfo.InvariantCulture);
            environment[WorkerParentStartedVariable] = parentStarted.ToString(CultureInfo.InvariantCulture);
            environment[WorkerArgumentCountVariable] = arguments.Length.ToString(CultureInfo.InvariantCulture);

            int index;
            for (index = 0; index < arguments.Length; index++)
            {
                environment[WorkerArgumentPrefix + index.ToString(CultureInfo.InvariantCulture)] =
                    EncodeArgument(arguments[index] ?? String.Empty);
            }

            Process worker = Process.Start(startInfo);
            if (worker == null)
            {
                throw new InvalidOperationException("Windows did not return a process for the temporary launcher worker.");
            }

            workerStarted = true;
            worker.Dispose();
            return 0;
        }
        catch (Exception exception)
        {
            ShowError(
                "无法创建无窗口启动进程。" + Environment.NewLine +
                "Could not create the no-console launcher process." + Environment.NewLine +
                Environment.NewLine + exception.Message);
            return ErrorDispatchWorker;
        }
        finally
        {
            if (!workerStarted && !String.IsNullOrEmpty(workerDirectory))
            {
                TryDeleteDirectory(workerDirectory);
            }
        }
    }

    private static int RunWorker()
    {
        WorkerContext context = null;
        string cleanupDirectory = null;

        try
        {
            context = ReadAndValidateWorkerContext(out cleanupDirectory);

            WaitForParentExit(context.ParentPid, context.ParentStartedUtcTicks);

            string mutexName = BuildMutexName(context.AppRoot);
            using (Mutex launchMutex = new Mutex(false, mutexName))
            {
                bool ownsMutex = false;
                try
                {
                    try
                    {
                        ownsMutex = launchMutex.WaitOne();
                    }
                    catch (AbandonedMutexException)
                    {
                        ownsMutex = true;
                    }

                    int recoveryResult = RecoverPendingUpdateIfRequired(context);
                    if (recoveryResult != 0)
                    {
                        return recoveryResult;
                    }

                    return StartRuntime(context);
                }
                finally
                {
                    if (ownsMutex)
                    {
                        try
                        {
                            launchMutex.ReleaseMutex();
                        }
                        catch (ApplicationException)
                        {
                            // The mutex was already abandoned or released; cleanup must still run.
                        }
                    }
                }
            }
        }
        catch (Exception exception)
        {
            ShowError(
                "DeepSeek Harness 后台启动进程失败。" + Environment.NewLine +
                "The DeepSeek Harness background launcher failed." + Environment.NewLine +
                Environment.NewLine + exception.Message);
            return context == null ? ErrorWorkerContext : ErrorStartRuntime;
        }
        finally
        {
            if (!String.IsNullOrEmpty(cleanupDirectory))
            {
                ScheduleWorkerCleanup(cleanupDirectory);
            }
        }
    }

    private static int RecoverPendingUpdateIfRequired(WorkerContext context)
    {
        TransactionInspection inspection = InspectTransaction(context.AppRoot);
        if (inspection.State == TransactionState.Absent || inspection.State == TransactionState.Terminal)
        {
            return 0;
        }

        string updateScript = Path.Combine(context.AppRoot, UpdateScriptName);
        if (!File.Exists(updateScript))
        {
            ShowError(
                "无法恢复未完成的更新：找不到更新脚本。" + Environment.NewLine +
                "Cannot recover the unfinished update because the updater script is missing." + Environment.NewLine +
                Environment.NewLine +
                "预期位置 / Expected location:" + Environment.NewLine + updateScript + Environment.NewLine +
                Environment.NewLine + inspection.Detail);
            return ErrorMissingFile;
        }

        int exitCode;
        try
        {
            string powerShell = GetWindowsPowerShellPath();
            ProcessStartInfo recovery = CreateHiddenStartInfo(powerShell, context.AppRoot);
            RemoveWorkerMetadata(recovery.EnvironmentVariables);
            recovery.EnvironmentVariables[GuiLauncherVariable] = "1";
            recovery.Arguments = BuildWindowsArguments(new string[]
            {
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                updateScript,
                "-RecoverOnly",
                "-AppRoot",
                context.AppRoot
            });

            using (Process updater = Process.Start(recovery))
            {
                if (updater == null)
                {
                    throw new InvalidOperationException("Windows did not return a process for powershell.exe.");
                }

                updater.WaitForExit();
                exitCode = updater.ExitCode;
            }
        }
        catch (Exception exception)
        {
            ShowError(
                "无法启动更新恢复进程。" + Environment.NewLine +
                "Could not start the update recovery process." + Environment.NewLine +
                Environment.NewLine + exception.Message);
            return ErrorRecovery;
        }

        if (exitCode != 0)
        {
            ShowError(
                "未完成的更新恢复失败，桌面应用未启动。" + Environment.NewLine +
                "Recovery of the unfinished update failed; the desktop app was not started." + Environment.NewLine +
                Environment.NewLine +
                "退出代码 / Exit code: " + exitCode.ToString(CultureInfo.InvariantCulture));
            return exitCode;
        }

        TransactionInspection afterRecovery = InspectTransaction(context.AppRoot);
        if (afterRecovery.State != TransactionState.Absent && afterRecovery.State != TransactionState.Terminal)
        {
            ShowError(
                "更新恢复后事务状态仍不安全，桌面应用未启动。" + Environment.NewLine +
                "The update transaction is still unsafe after recovery; the desktop app was not started." +
                Environment.NewLine + Environment.NewLine + afterRecovery.Detail);
            return ErrorRecovery;
        }

        return 0;
    }

    private static TransactionInspection InspectTransaction(string appRoot)
    {
        string transactionPath = Path.Combine(appRoot, TransactionFileName);
        if (!File.Exists(transactionPath))
        {
            return new TransactionInspection(TransactionState.Absent, "No update transaction is present.");
        }

        try
        {
            string json;
            using (FileStream stream = new FileStream(
                transactionPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete))
            using (StreamReader reader = new StreamReader(stream, new UTF8Encoding(false, true), true))
            {
                json = reader.ReadToEnd();
            }

            if (String.IsNullOrWhiteSpace(json))
            {
                return new TransactionInspection(TransactionState.NeedsRecovery, "The update transaction file is empty.");
            }

            JavaScriptSerializer serializer = new JavaScriptSerializer();
            object parsed = serializer.DeserializeObject(json);
            IDictionary<string, object> root = parsed as IDictionary<string, object>;
            if (root == null)
            {
                return new TransactionInspection(
                    TransactionState.NeedsRecovery,
                    "The update transaction must be a JSON object.");
            }

            object phaseValue;
            if (!root.TryGetValue("phase", out phaseValue) || !(phaseValue is string))
            {
                return new TransactionInspection(
                    TransactionState.NeedsRecovery,
                    "The update transaction does not contain a string phase.");
            }

            string phase = (string)phaseValue;
            if (String.Equals(phase, "committed", StringComparison.Ordinal) ||
                String.Equals(phase, "rolled-back", StringComparison.Ordinal))
            {
                return new TransactionInspection(TransactionState.Terminal, "The update transaction is terminal: " + phase);
            }

            return new TransactionInspection(
                TransactionState.NeedsRecovery,
                "The update transaction is not terminal (phase: " + phase + ").");
        }
        catch (Exception exception)
        {
            return new TransactionInspection(
                TransactionState.NeedsRecovery,
                "The update transaction could not be read strictly: " + exception.Message);
        }
    }

    private static int StartRuntime(WorkerContext context)
    {
        string runtimeExecutable = Path.Combine(context.AppRoot, RuntimeRelativePath);
        if (!File.Exists(runtimeExecutable))
        {
            ShowError(
                "无法启动 DeepSeek Harness：找不到桌面运行时。" + Environment.NewLine +
                "Cannot start DeepSeek Harness because the desktop runtime is missing." + Environment.NewLine +
                Environment.NewLine +
                "预期位置 / Expected location:" + Environment.NewLine + runtimeExecutable);
            return ErrorMissingFile;
        }

        try
        {
            ProcessStartInfo runtime = CreateHiddenStartInfo(runtimeExecutable, context.AppRoot);
            // Only console-capable helper processes are hidden.  Electron is a
            // GUI process and must receive the normal show state for its first
            // application window.
            runtime.WindowStyle = ProcessWindowStyle.Normal;
            RemoveWorkerMetadata(runtime.EnvironmentVariables);
            runtime.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            runtime.EnvironmentVariables[GuiLauncherVariable] = "1";
            runtime.Arguments = BuildWindowsArguments(context.Arguments);

            using (Process desktop = Process.Start(runtime))
            {
                if (desktop == null)
                {
                    throw new InvalidOperationException("Windows did not return a process for the desktop runtime.");
                }

                // Do not hold the worker for the lifetime of Electron, but do
                // surface an immediate loader/startup crash instead of silently
                // reporting a successful launch.
                if (desktop.WaitForExit(EarlyRuntimeExitWindowMilliseconds))
                {
                    int exitCode = desktop.ExitCode;
                    if (exitCode != 0)
                    {
                        ShowError(
                            "DeepSeek Harness 桌面运行时启动后立即退出。" + Environment.NewLine +
                            "The DeepSeek Harness desktop runtime exited immediately after launch." +
                            Environment.NewLine + Environment.NewLine +
                            "退出代码 / Exit code: " + exitCode.ToString(CultureInfo.InvariantCulture));
                    }

                    return exitCode;
                }

                return 0;
            }
        }
        catch (Exception exception)
        {
            ShowError(
                "无法启动 DeepSeek Harness 桌面应用。" + Environment.NewLine +
                "Could not start the DeepSeek Harness desktop app." + Environment.NewLine +
                Environment.NewLine + exception.Message);
            return ErrorStartRuntime;
        }
    }

    /* Standard CommandLineToArgvW-compatible quoting for direct CreateProcess use. */
    private static string BuildWindowsArguments(string[] arguments)
    {
        StringBuilder commandLine = new StringBuilder();
        int index;
        for (index = 0; index < arguments.Length; index++)
        {
            if (index != 0)
            {
                commandLine.Append(' ');
            }

            commandLine.Append(QuoteWindowsArgument(arguments[index] ?? String.Empty));
        }

        return commandLine.ToString();
    }

    private static string QuoteWindowsArgument(string argument)
    {
        StringBuilder quoted = new StringBuilder(argument.Length + 2);
        quoted.Append('"');
        int backslashes = 0;
        int index;

        for (index = 0; index < argument.Length; index++)
        {
            char character = argument[index];
            if (character == '\\')
            {
                backslashes++;
                continue;
            }

            if (character == '"')
            {
                quoted.Append('\\', (backslashes * 2) + 1);
                quoted.Append('"');
                backslashes = 0;
                continue;
            }

            quoted.Append('\\', backslashes);
            backslashes = 0;
            quoted.Append(character);
        }

        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private static WorkerContext ReadAndValidateWorkerContext(out string cleanupDirectory)
    {
        cleanupDirectory = null;
        string token = RequireEnvironmentVariable(WorkerTokenVariable);
        if (!IsHexToken(token))
        {
            throw new InvalidOperationException("The launcher worker token is invalid.");
        }

        string currentDirectory = NormalizeDirectory(Path.GetDirectoryName(GetExecutablePath()));
        string suppliedWorkerDirectory = NormalizeDirectory(RequireEnvironmentVariable(WorkerDirectoryVariable));
        string expectedLeaf = WorkerDirectoryPrefix + token;
        DirectoryInfo workerInfo = new DirectoryInfo(currentDirectory);

        if (!PathsEqual(currentDirectory, suppliedWorkerDirectory) ||
            !String.Equals(workerInfo.Name, expectedLeaf, StringComparison.OrdinalIgnoreCase) ||
            workerInfo.Parent == null ||
            !PathsEqual(workerInfo.Parent.FullName, GetTempContainerDirectory()))
        {
            throw new InvalidOperationException("The launcher worker is not running from its expected temporary directory.");
        }

        // From this point onward the target is a validated, unique worker leaf.
        // Preserve it even if later metadata is corrupt so the failure path can
        // still remove the copied executable.
        cleanupDirectory = currentDirectory;

        string appRoot = NormalizeDirectory(RequireEnvironmentVariable(WorkerRootVariable));
        if (IsSameOrChildPath(currentDirectory, appRoot))
        {
            throw new InvalidOperationException("The launcher worker must run outside the application directory.");
        }

        int parentPid;
        if (!Int32.TryParse(
                RequireEnvironmentVariable(WorkerParentPidVariable),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out parentPid) || parentPid <= 0)
        {
            throw new InvalidOperationException("The launcher parent process identifier is invalid.");
        }

        long parentStarted;
        if (!Int64.TryParse(
                RequireEnvironmentVariable(WorkerParentStartedVariable),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out parentStarted) || parentStarted <= 0)
        {
            throw new InvalidOperationException("The launcher parent start time is invalid.");
        }

        int argumentCount;
        if (!Int32.TryParse(
                RequireEnvironmentVariable(WorkerArgumentCountVariable),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out argumentCount) || argumentCount < 0 || argumentCount > 4096)
        {
            throw new InvalidOperationException("The launcher argument count is invalid.");
        }

        string[] arguments = new string[argumentCount];
        int index;
        for (index = 0; index < argumentCount; index++)
        {
            string encoded = RequireEnvironmentVariable(
                WorkerArgumentPrefix + index.ToString(CultureInfo.InvariantCulture));
            arguments[index] = DecodeArgument(encoded);
        }

        WorkerContext context = new WorkerContext();
        context.Token = token;
        context.WorkerDirectory = currentDirectory;
        context.AppRoot = appRoot;
        context.ParentPid = parentPid;
        context.ParentStartedUtcTicks = parentStarted;
        context.Arguments = arguments;
        context.ArgumentCount = argumentCount;
        return context;
    }

    private static void WaitForParentExit(int parentPid, long expectedStartedUtcTicks)
    {
        if (parentPid == Process.GetCurrentProcess().Id)
        {
            throw new InvalidOperationException("The launcher worker cannot wait on itself.");
        }

        try
        {
            using (Process parent = Process.GetProcessById(parentPid))
            {
                bool isExpectedParent = true;
                try
                {
                    isExpectedParent = parent.StartTime.ToUniversalTime().Ticks == expectedStartedUtcTicks;
                }
                catch (Exception)
                {
                    // Same-user parent start times are normally readable.  If they are
                    // not, waiting is safer than racing an image that may still be mapped.
                }

                if (isExpectedParent)
                {
                    parent.WaitForExit();
                }
            }
        }
        catch (ArgumentException)
        {
            // The root launcher already exited before the worker opened its handle.
        }
        catch (InvalidOperationException)
        {
            // The process exited between lookup and WaitForExit.
        }
    }

    private static ProcessStartInfo CreateHiddenStartInfo(string fileName, string workingDirectory)
    {
        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.FileName = fileName;
        startInfo.Arguments = String.Empty;
        startInfo.WorkingDirectory = workingDirectory;
        startInfo.UseShellExecute = false;
        startInfo.CreateNoWindow = true;
        startInfo.WindowStyle = ProcessWindowStyle.Hidden;
        startInfo.ErrorDialog = false;
        return startInfo;
    }

    private static void RemoveWorkerMetadata(StringDictionary environment)
    {
        environment.Remove(WorkerModeVariable);
        environment.Remove(WorkerTokenVariable);
        environment.Remove(WorkerDirectoryVariable);
        environment.Remove(WorkerRootVariable);
        environment.Remove(WorkerParentPidVariable);
        environment.Remove(WorkerParentStartedVariable);
        environment.Remove(WorkerArgumentCountVariable);

        List<string> argumentVariables = new List<string>();
        foreach (string name in environment.Keys)
        {
            if (name.StartsWith(WorkerArgumentPrefix, StringComparison.OrdinalIgnoreCase))
            {
                argumentVariables.Add(name);
            }
        }

        int index;
        for (index = 0; index < argumentVariables.Count; index++)
        {
            environment.Remove(argumentVariables[index]);
        }
    }

    private static string BuildMutexName(string appRoot)
    {
        byte[] input = Encoding.UTF8.GetBytes(NormalizeDirectory(appRoot).ToUpperInvariant());
        byte[] digest;
        using (SHA256 algorithm = SHA256.Create())
        {
            digest = algorithm.ComputeHash(input);
        }

        StringBuilder hexadecimal = new StringBuilder(digest.Length * 2);
        int index;
        for (index = 0; index < digest.Length; index++)
        {
            hexadecimal.Append(digest[index].ToString("x2", CultureInfo.InvariantCulture));
        }

        return "Local\\DeepSeekHarnessLauncher-" + hexadecimal.ToString();
    }

    private static string EncodeArgument(string value)
    {
        byte[] bytes = new byte[value.Length * 2];
        int index;
        for (index = 0; index < value.Length; index++)
        {
            char character = value[index];
            bytes[index * 2] = (byte)(character & 0xff);
            bytes[(index * 2) + 1] = (byte)(character >> 8);
        }

        // The non-empty prefix distinguishes an encoded empty argument from a
        // missing environment variable.
        return "1" + Convert.ToBase64String(bytes);
    }

    private static string DecodeArgument(string encoded)
    {
        if (encoded.Length == 0 || encoded[0] != '1')
        {
            throw new InvalidOperationException("A launcher argument is not encoded correctly.");
        }

        byte[] bytes = Convert.FromBase64String(encoded.Substring(1));
        if ((bytes.Length & 1) != 0)
        {
            throw new InvalidOperationException("A launcher argument has an invalid encoded length.");
        }

        char[] characters = new char[bytes.Length / 2];
        int index;
        for (index = 0; index < characters.Length; index++)
        {
            characters[index] = (char)(bytes[index * 2] | (bytes[(index * 2) + 1] << 8));
        }

        return new String(characters);
    }

    private static string RequireEnvironmentVariable(string name)
    {
        string value = Environment.GetEnvironmentVariable(name);
        if (String.IsNullOrEmpty(value))
        {
            throw new InvalidOperationException("Required launcher state is missing: " + name);
        }

        return value;
    }

    private static bool IsHexToken(string value)
    {
        if (value == null || value.Length != 32)
        {
            return false;
        }

        int index;
        for (index = 0; index < value.Length; index++)
        {
            char character = value[index];
            bool decimalDigit = character >= '0' && character <= '9';
            bool lowerHex = character >= 'a' && character <= 'f';
            if (!decimalDigit && !lowerHex)
            {
                return false;
            }
        }

        return true;
    }

    private static string GetExecutablePath()
    {
        string location = Assembly.GetExecutingAssembly().Location;
        if (String.IsNullOrEmpty(location))
        {
            throw new InvalidOperationException("Windows did not report the launcher executable path.");
        }

        return Path.GetFullPath(location);
    }

    private static string GetCommandProcessorPath()
    {
        string systemDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System);
        if (String.IsNullOrEmpty(systemDirectory))
        {
            string systemRoot = Environment.GetEnvironmentVariable("SystemRoot");
            if (String.IsNullOrEmpty(systemRoot))
            {
                throw new InvalidOperationException("Windows did not report its system directory.");
            }

            systemDirectory = Path.Combine(systemRoot, "System32");
        }

        string commandProcessor = Path.Combine(systemDirectory, "cmd.exe");
        if (!File.Exists(commandProcessor))
        {
            throw new FileNotFoundException("The Windows command processor was not found.", commandProcessor);
        }

        return commandProcessor;
    }

    private static string GetWindowsPowerShellPath()
    {
        string systemDirectory = Path.GetDirectoryName(GetCommandProcessorPath());
        string powerShell = Path.Combine(systemDirectory, "WindowsPowerShell\\v1.0\\powershell.exe");
        if (!File.Exists(powerShell))
        {
            throw new FileNotFoundException("Windows PowerShell was not found.", powerShell);
        }

        return powerShell;
    }

    private static string GetTempContainerDirectory()
    {
        return NormalizeDirectory(Path.Combine(Path.GetTempPath(), TempContainerName));
    }

    private static string NormalizeDirectory(string path)
    {
        if (String.IsNullOrEmpty(path))
        {
            throw new ArgumentException("A directory path is required.", "path");
        }

        string fullPath = Path.GetFullPath(path);
        string root = Path.GetPathRoot(fullPath);
        while (fullPath.Length > root.Length &&
               (fullPath[fullPath.Length - 1] == Path.DirectorySeparatorChar ||
                fullPath[fullPath.Length - 1] == Path.AltDirectorySeparatorChar))
        {
            fullPath = fullPath.Substring(0, fullPath.Length - 1);
        }

        return fullPath;
    }

    private static bool PathsEqual(string left, string right)
    {
        return String.Equals(
            NormalizeDirectory(left),
            NormalizeDirectory(right),
            StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSameOrChildPath(string candidate, string parent)
    {
        string normalizedCandidate = NormalizeDirectory(candidate);
        string normalizedParent = NormalizeDirectory(parent);
        if (String.Equals(normalizedCandidate, normalizedParent, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        string parentWithSeparator = normalizedParent;
        if (!parentWithSeparator.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal) &&
            !parentWithSeparator.EndsWith(Path.AltDirectorySeparatorChar.ToString(), StringComparison.Ordinal))
        {
            parentWithSeparator += Path.DirectorySeparatorChar;
        }

        return normalizedCandidate.StartsWith(parentWithSeparator, StringComparison.OrdinalIgnoreCase);
    }

    private static void ScheduleWorkerCleanup(string workerDirectory)
    {
        DirectoryInfo workerInfo;

        try
        {
            workerInfo = new DirectoryInfo(NormalizeDirectory(workerDirectory));
            string expectedLeaf = workerInfo.Name;
            string cleanupToken = expectedLeaf.StartsWith(WorkerDirectoryPrefix, StringComparison.Ordinal)
                ? expectedLeaf.Substring(WorkerDirectoryPrefix.Length)
                : String.Empty;
            if (!IsHexToken(cleanupToken) ||
                workerInfo.Parent == null ||
                !PathsEqual(workerInfo.Parent.FullName, GetTempContainerDirectory()))
            {
                return;
            }

            string commandProcessor = GetCommandProcessorPath();
            ProcessStartInfo cleanup = CreateHiddenStartInfo(commandProcessor, workerInfo.Parent.FullName);
            RemoveWorkerMetadata(cleanup.EnvironmentVariables);
            cleanup.EnvironmentVariables["PATH"] = Path.GetDirectoryName(commandProcessor);
            cleanup.Arguments =
                "/D /Q /V:OFF /S /C \"for /L %G in (1,1,30) do (" +
                "rd /S /Q " + expectedLeaf + " >nul 2>&1 & " +
                "if not exist " + expectedLeaf + " exit /B 0 & " +
                "ping.exe -n 2 127.0.0.1 >nul 2>&1) & exit /B 0\"";

            Process cleanupProcess = Process.Start(cleanup);
            if (cleanupProcess == null)
            {
                throw new InvalidOperationException("Windows did not return a cleanup process.");
            }

            cleanupProcess.Dispose();
        }
        catch (Exception)
        {
            TryScheduleDeleteOnReboot(workerDirectory);
        }
    }

    private static void TryDeleteDirectory(string directory)
    {
        try
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, true);
            }
        }
        catch (Exception)
        {
            TryScheduleDeleteOnReboot(directory);
        }
    }

    private static void TryScheduleDeleteOnReboot(string workerDirectory)
    {
        try
        {
            string workerExecutable = Path.Combine(workerDirectory, WorkerExecutableName);
            if (File.Exists(workerExecutable))
            {
                MoveFileExW(workerExecutable, null, MoveFileDelayUntilReboot);
            }

            if (Directory.Exists(workerDirectory))
            {
                MoveFileExW(workerDirectory, null, MoveFileDelayUntilReboot);
            }
        }
        catch (Exception)
        {
            // Cleanup is best-effort and must never replace the real startup result.
        }
    }

    private static void ShowMissingScript(string scriptPath)
    {
        ShowError(
            "无法启动 DeepSeek Harness：找不到启动脚本。" + Environment.NewLine +
            "Cannot start DeepSeek Harness because the startup script is missing." + Environment.NewLine +
            Environment.NewLine +
            "预期位置 / Expected location:" + Environment.NewLine + scriptPath);
    }

    private static void ShowError(string message)
    {
        try
        {
            MessageBoxW(
                IntPtr.Zero,
                message,
                "DeepSeek Harness 启动错误 / Startup Error",
                MessageBoxOk | MessageBoxIconError | MessageBoxSetForeground | MessageBoxTopMost);
        }
        catch (Exception)
        {
            // A GUI-subsystem process has no reliable stderr fallback.
        }
    }

    private enum TransactionState
    {
        Absent,
        Terminal,
        NeedsRecovery
    }

    private sealed class TransactionInspection
    {
        internal readonly TransactionState State;
        internal readonly string Detail;

        internal TransactionInspection(TransactionState state, string detail)
        {
            State = state;
            Detail = detail;
        }
    }

    private sealed class WorkerContext
    {
        internal string Token;
        internal string WorkerDirectory;
        internal string AppRoot;
        internal int ParentPid;
        internal long ParentStartedUtcTicks;
        internal string[] Arguments;
        internal int ArgumentCount;
    }
}
