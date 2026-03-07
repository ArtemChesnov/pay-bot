# Подключение к GitHub по SSH и настройка автодеплоя

## Часть 1: SSH-ключ и подключение репозитория (на вашем ПК)

### 1. Создать SSH-ключ для GitHub (если ещё нет)

В PowerShell:

```powershell
# Ключ для GitHub (указать свой email)
ssh-keygen -t ed25519 -C "jaksan37@gmail.com" -f "$env:USERPROFILE\.ssh\id_ed25519_github" -N '""'
```

Если `~/.ssh` нет, создайте: `mkdir $env:USERPROFILE\.ssh` (если попросит passphrase — можно оставить пустым Enter).

### 2. Добавить ключ в GitHub (обязательно)

Нужно скопировать **публичный** ключ и вставить его в настройках GitHub.

**В PowerShell выполните:**

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519_github.pub"
```

Скопируйте **всю** выведенную строку (начинается с `ssh-ed25519`, заканчивается вашим email).

**На сайте GitHub:**

1. Откройте https://github.com и войдите в аккаунт.
2. Справа вверху: иконка профиля → **Settings**.
3. Слева: **SSH and GPG keys**.
4. Кнопка **New SSH key**.
5. **Title:** например `Pay-bot` (название для себя).
6. **Key:** вставьте скопированную строку с ключом.
7. Нажмите **Add SSH key**.

---

### 3. Файл config — чтобы Git использовал именно этот ключ

Когда у вас несколько ключей, Git должен знать: для GitHub использовать ключ `id_ed25519_github`. Для этого нужен файл **config** в папке с ключами.

**Как создать или изменить config:**

**Вариант через команду (проще всего):** выполните в PowerShell — в папке `.ssh` создастся файл `config` с нужным содержимым:

```powershell
$configPath = "$env:USERPROFILE\.ssh\config"
$content = @"
Host github.com
  HostName github.com
  User git
  IdentityFile $env:USERPROFILE/.ssh/id_ed25519_github
  IdentitiesOnly yes
"@
New-Item -ItemType Directory -Path "$env:USERPROFILE\.ssh" -Force | Out-Null
Set-Content -Path $configPath -Value $content.Trim()
```

**Проверить, что сработало:** в PowerShell выполните:

```powershell
Test-Path "$env:USERPROFILE\.ssh\config"
Get-Content "$env:USERPROFILE\.ssh\config"
```

Первая команда должна вывести **True** (файл есть). Вторая покажет содержимое — должны быть строки `Host github.com`, `IdentityFile ...`, и т.д.

Если у вас уже есть свой `config` с другими ключами — не запускайте команду создания, добавьте блок вручную в конец файла.

**Либо вручную:**

1. Откройте папку `C:\Users\CHE\.ssh` в проводнике (или введите в адресной строке `%USERPROFILE%\.ssh`).
2. Если файла **config** нет — создайте: правый клик → Создать → Текстовый документ, назовите его `config` (без .txt). Если Windows спросит про расширение — уберите `.txt`.
3. Откройте **config** в Блокноте или в Cursor и вставьте туда:

```
Host github.com
  HostName github.com
  User git
  IdentityFile C:/Users/CHE/.ssh/id_ed25519_github
  IdentitiesOnly yes
```

4. Сохраните файл и закройте.

**Зачем это:** при команде `git push` или `git clone git@github.com:...` система будет брать ключ из `id_ed25519_github`, и не будет путать его с ключом другого проекта.

---

### 4. Проверить, что GitHub вас узнаёт

В PowerShell:

```powershell
ssh -T git@github.com
```

При первом запуске может спросить «Are you sure you want to continue connecting?» — введите **yes** и Enter.

Успех — если появится что-то вроде: **Hi ArtemChesnov! You've successfully authenticated...**

Если видите такую строку — переходите к шагу 5.

---

### 5. Подключить папку pay-bot к репозиторию на GitHub

Репозиторий: **git@github.com:ArtemChesnov/pay-bot.git**

**Если репозиторий на GitHub пустой (без README):**

```powershell
cd "c:\Users\CHE\Desktop\pay-bot"
# Если папка ещё не была git-репозиторием, сначала:
# git init
# git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:ArtemChesnov/pay-bot.git
git push -u origin main
```

**Если репозиторий уже создан с README и вы хотите отправить туда этот код:**

```powershell
cd "c:\Users\CHE\Desktop\pay-bot"
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:ArtemChesnov/pay-bot.git
git pull origin main --allow-unrelated-histories
git push -u origin main
```

После успешного `git push` проект будет привязан к GitHub: https://github.com/ArtemChesnov/pay-bot. Дальнейшие изменения: `git add .` → `git commit -m "..."` → `git push`.

---

## Часть 2: Автодеплой (GitHub Actions → VPS)

Workflow уже есть: `.github/workflows/deploy.yml`. При **push в ветку `main`** он подключается по SSH к VPS и обновляет код.

### На VPS (один раз)

1. **Клонировать репо на сервер** (если ещё не клонирован). Лучше по SSH (через Deploy Key):

   На VPS под пользователем, от которого будет деплой (например `root`):

   ```bash
   ssh-keygen -t ed25519 -C "deploy-pay-bot" -f ~/.ssh/deploy_pay_bot -N ""
   cat ~/.ssh/deploy_pay_bot.pub
   ```

   В GitHub: https://github.com/ArtemChesnov/pay-bot → **Settings → Deploy keys → Add deploy key**. Вставить `.pub`, доступ **Read**.

   В `~/.ssh/config` на VPS:

   ```bash
   echo 'Host github.com
     HostName github.com
     User git
     IdentityFile ~/.ssh/deploy_pay_bot
     IdentitiesOnly yes' >> ~/.ssh/config
   chmod 600 ~/.ssh/config
   ```

   Клон по SSH:

   ```bash
   sudo -u botapp git clone git@github.com:ArtemChesnov/pay-bot.git /opt/bot
   ```

2. **Ключ для входа GitHub Actions на VPS**

   На своём ПК (или в Codespaces):

   ```powershell
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N '""'
   ```

   - Файл **deploy_key.pub** — содержимое добавить в `~/.ssh/authorized_keys` пользователя на VPS (того, под кем деплой, например `root`).
   - Файл **deploy_key** (приватный, весь блок) — сохранить в секреты репозитория (шаг ниже). После добавления секрета файл `deploy_key` можно удалить с ПК.

   Если деплой не под `root`, дать право перезапускать сервис:

   ```bash
   sudo visudo
   # Добавить (подставьте пользователя):
   deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart pay-bot
   ```

### Секреты в GitHub

Репозиторий https://github.com/ArtemChesnov/pay-bot → **Settings → Secrets and variables → Actions** → **New repository secret**. Добавить:

| Имя               | Значение |
|-------------------|----------|
| `DEPLOY_HOST`     | `85.239.58.223` (IP вашего VPS) |
| `DEPLOY_USER`     | Пользователь SSH на VPS (например `root` или `deploy`) |
| `DEPLOY_PATH`     | Путь к проекту (например `/opt/bot`) |
| `SSH_PRIVATE_KEY` | Всё содержимое файла `deploy_key` (приватный ключ) |

После этого каждый **push в `main`** будет запускать деплой. Проверить: **Actions** во вкладке репозитория.

Подробнее: **README_PROD.md**, раздел «7.1 Автодеплой с GitHub».
