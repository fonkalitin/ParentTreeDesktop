# Сборка

Требуются Windows x64, .NET SDK 10 LTS, Node.js 24 и npm.
Для запуска уже собранного приложения SDK и Node.js не нужны.

```powershell
npm --prefix web ci
npm --prefix web test
./build.ps1
dotnet run --project tests/FileTests -c Release
dotnet run --project tests/WindowTests -c Release
python tools/check_release.py --dist dist
```

Готовый EXE и сопроводительные файлы появятся в dist.
Установщик WebView2 можно приложить отдельно:

```powershell
./build.ps1 -WebView2Installer C:\Downloads\MicrosoftEdgeWebView2RuntimeInstallerX64.exe
```

Скрипт проверяет подпись Microsoft и отклоняет маленький онлайн-загрузчик.
Установщик не запускается автоматически.
Нельзя класть рабочие деревья, ParentTreeData, ключи и настройки в исходники или релиз.

## Структура

- desktop — WinForms/WebView2 оболочка, файловые диалоги и атомарная запись.
- web/src — React/TypeScript редактор.
- examples — только вымышленные данные.
- tests — нативные регрессионные проверки.
- web/tests — тесты переносимости и сохранения.
- tools — проверка состава публикации.
- licenses — уведомления о сторонних компонентах.

Web-интерфейс в desktop-сборке читается из встроенного архива.
Программа не требует учётной записи и не выполняет запросов за вашими документами.
Технический адрес parenttree.local обслуживается встроенными байтами, а не внешним сайтом.

## Обновление

Обновляйте зависимости через package.json/package-lock.json и PackageReference.
После изменения зависимостей обновите THIRD_PARTY_NOTICES.md и licenses.
Проверяйте npm audit и dotnet list desktop package --vulnerable --include-transitive.
`global.json` допускает свежие SDK 10.0 без перехода на следующий major.
