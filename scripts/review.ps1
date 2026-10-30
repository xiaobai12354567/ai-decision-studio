[CmdletBinding()]
param(
    [switch]$PrepareOnly,
    [ValidateNotNullOrEmpty()]
    [string]$EnvFile = '.env.review'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectName = 'aiweb-review'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$originalLocation = Get-Location
$temporaryFile = $null
$exitCode = 1
$dockerExitCode = 0
$composeArguments = @('compose', '-p', $projectName, '--env-file', $EnvFile)

function Invoke-DockerCommand {
    param([string[]]$Arguments, [switch]$Quiet)
    $savedPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5 represents redirected native stderr as ErrorRecord.
        # Docker writes normal progress there too; determine success by exit code.
        $ErrorActionPreference = 'Continue'
        if ($Quiet) {
            & docker @Arguments *> $null
        }
        else {
            & docker @Arguments 2>&1 | ForEach-Object {
                if ($_ -is [System.Management.Automation.ErrorRecord]) {
                    [Console]::Error.WriteLine($_.ToString())
                }
                else {
                    Write-Output $_
                }
            }
        }
        $script:dockerExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $savedPreference
    }
}

function Show-LogsCommand {
    $quotedPath = $EnvFile.Replace("'", "''")
    [Console]::Error.WriteLine('From the project directory, inspect logs with:')
    [Console]::Error.WriteLine("  docker compose -p aiweb-review --env-file '$quotedPath' logs --tail=100 app postgres")
}

try {
    Set-Location -LiteralPath $projectDirectory
    if (-not $PrepareOnly) {
        if (-not (Get-Command docker -CommandType Application -ErrorAction SilentlyContinue)) {
            throw 'Docker CLI is required. Install Docker Desktop or Docker Engine first.'
        }
        Invoke-DockerCommand -Arguments @('compose', 'version') -Quiet
        if ($dockerExitCode -ne 0) {
            throw 'Docker Compose is required. Check docker compose version.'
        }
        Invoke-DockerCommand -Arguments @('info') -Quiet
        if ($dockerExitCode -ne 0) {
            throw 'Docker engine is unavailable. Start Docker Desktop or the Docker service, then retry.'
        }
    }

    $environmentPath = $EnvFile
    if (-not [IO.Path]::IsPathRooted($environmentPath)) {
        $environmentPath = Join-Path $projectDirectory $environmentPath
    }
    $environmentPath = [IO.Path]::GetFullPath($environmentPath)

    if (Test-Path -LiteralPath $environmentPath) {
        if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
            throw 'The environment path must be a regular file.'
        }
        Write-Host "Using existing $EnvFile without changes."
    }
    else {
        if (-not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($environmentPath))) {
            throw 'The environment file parent directory does not exist.'
        }
        $randomBytes = New-Object byte[] 24
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $generator.GetBytes($randomBytes)
        }
        finally {
            $generator.Dispose()
        }
        $password = [BitConverter]::ToString($randomBytes).Replace('-', '').ToLowerInvariant()
        $apiKey = ''
        $interactive = $false
        try {
            $interactive = [Environment]::UserInteractive -and
                -not [Console]::IsInputRedirected -and
                -not [Console]::IsOutputRedirected -and
                ([Environment]::GetCommandLineArgs() -inotcontains '-NonInteractive')
        }
        catch {
            $interactive = $false
        }
        if ($interactive) {
            $secureKey = Read-Host 'DeepSeek API key (optional; Enter for manual editing only)' -AsSecureString
            $keyPointer = [IntPtr]::Zero
            try {
                $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
                $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
            }
            finally {
                if ($keyPointer -ne [IntPtr]::Zero) {
                    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
                }
                $secureKey.Dispose()
            }
        }
        if ($apiKey.Contains('\')) {
            throw 'The key prompt does not support backslashes. Prepare without a key and edit the environment file instead.'
        }
        $escapedKey = $apiKey.Replace("'", "\'")
        $templatePath = Join-Path $projectDirectory '.env.docker.example'
        $lines = foreach ($line in [IO.File]::ReadAllLines($templatePath)) {
            if ($line.StartsWith('POSTGRES_PASSWORD=')) {
                "POSTGRES_PASSWORD=$password"
            }
            elseif ($line.StartsWith('DEEPSEEK_API_KEY=')) {
                "DEEPSEEK_API_KEY='$escapedKey'"
            }
            else {
                $line
            }
        }
        $temporaryFile = $environmentPath + '.tmp.' + [Guid]::NewGuid().ToString('N')
        $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
        [IO.File]::WriteAllText($temporaryFile, ($lines -join "`n") + "`n", $utf8WithoutBom)
        # File.Move fails rather than replacing a concurrently created config.
        [IO.File]::Move($temporaryFile, $environmentPath)
        $temporaryFile = $null
        $password = $null
        $apiKey = $null
        $escapedKey = $null
        Write-Host "Created $EnvFile with a random database password."
        Write-Host 'AI generation needs a valid DeepSeek key; an empty key enables manual editing only.'
    }

    if ($PrepareOnly) {
        Write-Host 'Configuration ready. No Docker services were started.'
        $exitCode = 0
    }
    else {
        Invoke-DockerCommand -Arguments ($composeArguments + @('up', '-d', '--build', '--wait', '--wait-timeout', '180'))
        $exitCode = $dockerExitCode
        if ($exitCode -ne 0) {
            [Console]::Error.WriteLine('Error: Review startup failed.')
            Show-LogsCommand
        }
        else {
            $binding = @(Invoke-DockerCommand -Arguments ($composeArguments + @('port', 'app', '3000')))
            if ($dockerExitCode -eq 0 -and ($binding -join "`n").Trim() -match ':(\d+)$') {
                Write-Host "Ready: http://localhost:$($Matches[1])"
            }
            else {
                [Console]::Error.WriteLine('Error: Services started, but the application port could not be determined.')
                Show-LogsCommand
                $exitCode = 1
            }
        }
    }
}
catch {
    $exitCode = 1
    [Console]::Error.WriteLine('Error: ' + $_.Exception.Message)
}
finally {
    if ($temporaryFile -and [IO.File]::Exists($temporaryFile)) {
        [IO.File]::Delete($temporaryFile)
    }
    Set-Location -LiteralPath $originalLocation.Path
}

exit $exitCode
