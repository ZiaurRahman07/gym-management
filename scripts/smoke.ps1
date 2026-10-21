# End-to-end smoke test for the API.
#
# Requires the API to be running and a seeded/test database. It creates a member,
# a staff account, payments, attendance and a renewal, then archives them, so do
# not point it at production data.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1 -Base https://your-api.example.com/api `
#     -Email admin@example.com -Password 'your-password'

param(
  [string]$Base = 'http://127.0.0.1:4000/api',
  [string]$Email = 'admin@gym.local',
  [string]$Password = 'Admin@12345'
)

$ErrorActionPreference = 'Stop'
$results = New-Object System.Collections.Generic.List[object]

function Record($name, $ok, $detail) {
  $label = 'PASS'
  if (-not $ok) { $label = 'FAIL' }
  $results.Add([pscustomobject]@{ Test = $name; Result = $label; Detail = $detail })
}

function Call($method, $path, $body, $token) {
  $headers = @{}
  if ($token) { $headers.Authorization = "Bearer $token" }
  if ($null -ne $body) {
    Invoke-RestMethod -Uri "$Base$path" -Method $method -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8)
  } else {
    Invoke-RestMethod -Uri "$Base$path" -Method $method -Headers $headers
  }
}

function Status($method, $path, $body, $token) {
  try {
    Call $method $path $body $token | Out-Null
    return 200
  } catch {
    return $_.Exception.Response.StatusCode.value__
  }
}

$h = Call 'GET' '/health' $null $null
Record 'health' ($h.status -eq 'ok' -and $h.database -eq 'connected') "status=$($h.status) database=$($h.database)"

Record 'reject wrong password' ((Status 'POST' '/auth/login' @{email=$Email;password='wrong-password'} $null) -eq 401) 'expected 401'

$login = Call 'POST' '/auth/login' @{email=$Email;password=$Password} $null
$token = $login.token
Record 'login' ([bool]$token) "user=$($login.user.email) role=$($login.user.role)"

$me = Call 'GET' '/auth/me' $null $token
Record 'auth/me' ($me.user.email -eq $Email) "email=$($me.user.email)"

Record 'reject anonymous' ((Status 'GET' '/members' $null $null) -eq 401) 'expected 401'

$dash = Call 'GET' '/dashboard/stats' $null $token
Record 'dashboard' ($null -ne $dash.data.activeMembers) "active=$($dash.data.activeMembers) revenue=$($dash.data.monthRevenue)"

$members = Call 'GET' '/members?limit=5' $null $token
Record 'members list' ($members.total -ge 1) "total=$($members.total) pages=$($members.totalPages)"

$plans = Call 'GET' '/plans?includeInactive=true' $null $token
Record 'plans list' ($plans.data.Count -ge 1) "plans=$($plans.data.Count)"

$subs = Call 'GET' '/subscriptions?limit=5' $null $token
Record 'subscriptions list' ($subs.total -ge 1) "total=$($subs.total)"

$pay = Call 'GET' '/payments?limit=5' $null $token
Record 'payments list' ($pay.total -ge 1) "total=$($pay.total) paid=$($pay.summary.paid)"

$att = Call 'GET' '/attendance/today' $null $token
Record 'attendance today' ($null -ne $att.data.todayCount) "today=$($att.data.todayCount) inside=$($att.data.insideCount)"

$trainers = Call 'GET' '/trainers?includeInactive=true' $null $token
Record 'trainers list' ($trainers.data.Count -ge 1) "trainers=$($trainers.data.Count)"

$notif = Call 'GET' '/notifications' $null $token
Record 'notifications' ($notif.data.Count -ge 0) "count=$($notif.data.Count) unread=$($notif.unread)"

$settings = Call 'GET' '/settings' $null $token
Record 'settings' ([bool]$settings.data.gymName) "gym=$($settings.data.gymName)"

$users = Call 'GET' '/users' $null $token
Record 'users list' ($users.data.Count -ge 1) "users=$($users.data.Count)"

foreach ($r in 'revenue', 'members', 'attendance', 'trainers') {
  $rep = Call 'GET' "/reports/$r" $null $token
  Record "report $r" ($null -ne $rep.data.from) "from=$($rep.data.from) to=$($rep.data.to)"
}

$search = Call 'GET' '/members?q=GYM-0001' $null $token
Record 'member search' ($search.total -eq 1) "matches=$($search.total)"

$expiring = Call 'GET' '/subscriptions/expiring?days=7' $null $token
Record 'expiring memberships' ($expiring.data.Count -ge 0) "count=$($expiring.data.Count)"

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$emailAddr = "smoke.$stamp@example.com"
$created = Call 'POST' '/members' @{
  firstName = 'Smoke'
  lastName = 'Runner'
  email = $emailAddr
  phone = '+1-555-8800'
  gender = 'other'
  joinDate = (Get-Date -Format 'yyyy-MM-dd')
  status = 'active'
  planId = 2
  discount = 5
  paymentMethod = 'cash'
} $token
$memberId = $created.data.id
Record 'create member + membership + payment' ([bool]$memberId -and $created.data.memberCode -like 'GYM-*') "id=$memberId code=$($created.data.memberCode) sub=$($created.enrollment.subscriptionId)"

$detail = Call 'GET' "/members/$memberId" $null $token
Record 'member detail' ($detail.data.subscriptions.Count -eq 1 -and $detail.data.payments.Count -eq 1) "paid=$($detail.data.stats.totalPaid) visits=$($detail.data.stats.visits)"

$checkin = Call 'POST' '/attendance/check-in' @{memberId=$memberId} $token
Record 'check in' ([bool]$checkin.data.id) "attendance=$($checkin.data.id)"
Record 'block duplicate check-in' ((Status 'POST' '/attendance/check-in' @{memberId=$memberId} $token) -eq 409) 'expected 409'
$checkout = Call 'PATCH' "/attendance/$($checkin.data.id)/check-out" @{} $token
Record 'check out' ([bool]$checkout.data.checkOutAt) "out=$($checkout.data.checkOutAt)"

$payment = Call 'POST' '/payments' @{memberId=$memberId;amount=15;method='card';notes='Smoke test fee'} $token
Record 'record payment' ([bool]$payment.data.invoiceNo) "invoice=$($payment.data.invoiceNo)"
$refund = Call 'POST' "/payments/$($payment.data.id)/refund" @{reason='Smoke test'} $token
Record 'refund payment' ($refund.data.status -eq 'refunded') "status=$($refund.data.status)"
Record 'block refund twice' ((Status 'POST' "/payments/$($payment.data.id)/refund" @{} $token) -eq 400) 'expected 400'

$renew = Call 'POST' '/subscriptions' @{memberId=$memberId;planId=3;payment=@{method='card'}} $token
Record 'renew membership' ([bool]$renew.data.id) "sub=$($renew.data.id) start=$($renew.data.startDate) end=$($renew.data.endDate)"
Record 'block overlapping start' ((Status 'POST' '/subscriptions' @{memberId=$memberId;planId=2;startDate=$renew.data.startDate;payment=@{method='cash'}} $token) -eq 409) 'expected 409 from exclusion constraint'

$freeze = Call 'PATCH' "/subscriptions/$($renew.data.id)" @{action='freeze'} $token
Record 'freeze membership' ($freeze.data.status -eq 'frozen') "status=$($freeze.data.status)"
$unfreeze = Call 'PATCH' "/subscriptions/$($renew.data.id)" @{action='unfreeze'} $token
Record 'unfreeze membership' ($unfreeze.data.status -eq 'active') "status=$($unfreeze.data.status) end=$($unfreeze.data.endDate)"
$cancel = Call 'PATCH' "/subscriptions/$($renew.data.id)" @{action='cancel'} $token
Record 'cancel membership' ($cancel.data.status -eq 'cancelled') "status=$($cancel.data.status)"

$assign = Call 'POST' '/trainers/1/assign' @{memberId=$memberId} $token
Record 'assign trainer' ($assign.ok -eq $true) 'assigned to trainer 1'
$roster = Call 'GET' '/trainers/1/members' $null $token
$onRoster = @($roster.data | Where-Object { $_.id -eq $memberId }).Count
Record 'trainer roster' ($onRoster -eq 1) "roster=$($roster.data.Count) match=$onRoster"
$unassign = Call 'DELETE' "/trainers/1/assign/$memberId" $null $token
Record 'unassign trainer' ($unassign.ok -eq $true) 'unassigned'

$userEmail = "staff.$stamp@example.com"
$newUser = Call 'POST' '/users' @{name='Smoke Staff';email=$userEmail;password='StaffPass123!';role='receptionist'} $token
Record 'create staff user' ([bool]$newUser.data.id) "email=$($newUser.data.email)"
$staffLogin = Call 'POST' '/auth/login' @{email=$userEmail;password='StaffPass123!'} $null
Record 'new staff can log in' ([bool]$staffLogin.token) "role=$($staffLogin.user.role)"
Record 'receptionist cannot create users' ((Status 'POST' '/users' @{name='Nope';email="nope.$stamp@example.com";password='NopePass123!';role='admin'} $staffLogin.token) -eq 403) 'expected 403'
Record 'receptionist can read members' ((Status 'GET' '/members?limit=1' $null $staffLogin.token) -eq 200) 'expected 200'
$deactivate = Call 'DELETE' "/users/$($newUser.data.id)" $null $token
Record 'deactivate staff user' ($deactivate.ok -eq $true) 'deactivated'
Record 'block disabled user login' ((Status 'POST' '/auth/login' @{email=$userEmail;password='StaffPass123!'} $null) -eq 403) 'expected 403'

$beforeLead = (Call 'GET' '/settings' $null $token).data.alertLeadDays
$updated = Call 'PUT' '/settings' @{alertLeadDays=9} $token
Record 'update settings' ($updated.data.alertLeadDays -eq 9) "lead=$($updated.data.alertLeadDays)"
Call 'PUT' '/settings' @{alertLeadDays=$beforeLead} $token | Out-Null

$csvPath = Join-Path $env:TEMP "smoke-revenue-$stamp.csv"
Invoke-WebRequest -Uri "$Base/reports/revenue/export?groupBy=month" -Headers @{Authorization="Bearer $token"} -OutFile $csvPath
Record 'CSV export' ((Get-Item $csvPath).Length -gt 20) "bytes=$((Get-Item $csvPath).Length)"

$archive = Call 'DELETE' "/members/$memberId" $null $token
Record 'archive member' ($archive.ok -eq $true) 'archived'
Record 'archived member hidden' ((Status 'GET' "/members/$memberId" $null $token) -eq 404) 'expected 404'

$results | Format-Table -AutoSize -Wrap
$failed = @($results | Where-Object { $_.Result -eq 'FAIL' }).Count
Write-Output ""
Write-Output "TOTAL: $($results.Count)  PASS: $($results.Count - $failed)  FAIL: $failed"
