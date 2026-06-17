# 🧪 OTracker Test Vault

This vault provides comprehensive testing for the OTracker 21 plugin.

## 🎯 How to Use This Test Vault

1. **Install the Plugin**: Install OTracker 21 in this vault
2. **Open Test Dashboard**: Start with `🧪 Test Dashboard.md`
3. **Run Through Tests**: Follow the checklists in each test file
4. **Report Issues**: Document any bugs or unexpected behavior

## 📁 Test File Structure

| File | Purpose |
|------|---------|
| `🧪 Test Dashboard.md` | Main test page with core functionality |
| `📊 Settings Matrix.md` | All settings combinations |
| `🐛 Edge Cases.md` | Error handling and edge cases |
| `⚡ Performance Tests.md` | Large data sets and performance |

## 📂 Test Folders

| Folder | Contents |
|--------|----------|
| `habits/` | Main test habits with various configurations |
| `single-habits/` | Individual habit files for specific tests |
| `broken-habits/` | Files with intentional errors |
| `timezone-tests/` | Timezone and date edge cases |
| `mixed-content/` | Folder with habits + other files |
| `nested/deep/` | Deep folder structure test |
| `empty-folder/` | Empty folder test |

## ✅ Testing Checklist

### Core Functionality
- [ ] Habits display correctly
- [ ] Clicking toggles work
- [ ] File changes persist
- [ ] Streaks calculate properly
- [ ] External file changes update UI

### Settings & Configuration
- [ ] All boolean combinations work
- [ ] Path settings (file vs folder) work
- [ ] Color customization works
- [ ] Days to show affects display
- [ ] Debug mode shows console output

### Error Handling
- [ ] Invalid JSON shows clear errors
- [ ] Missing files handled gracefully
- [ ] Malformed YAML recovers properly
- [ ] Plugin recovers after fixing errors

### Edge Cases
- [ ] Unicode characters display
- [ ] Very long habit names wrap
- [ ] Empty folders show messages
- [ ] Large data sets perform well

### Cross-Platform
- [ ] Light/dark themes work
- [ ] Mobile responsive
- [ ] Different screen sizes
- [ ] Various browsers

## 🐛 Bug Reporting

When you find issues, please document:

1. **What you did**: Specific steps to reproduce
2. **What you expected**: Expected behavior
3. **What happened**: Actual behavior
4. **Environment**: OS, Obsidian version, plugin version
5. **Console errors**: Any JavaScript errors
6. **Test file**: Which test file/configuration

## 📝 Test Results Template

```
## Test Session: [Date]

**Environment:**
- OS:
- Obsidian:
- Plugin Version:

**Results:**
- ✅ Core functionality works
- ❌ Settings matrix has issue with...
- ⚠️ Performance degrades with...

**Issues Found:**
1. Issue description...
2. Another issue...

**Notes:**
Additional observations...
```

## 🎯 Advanced Testing

For thorough testing:

1. **Test on multiple platforms** (Windows, Mac, Linux, mobile)
2. **Test with different themes** (light, dark, community themes)
3. **Test with large data sets** (100+ habits, 365+ days)
4. **Test concurrent usage** (multiple habit trackers on same page)
5. **Test integration** (with other plugins, sync services)

## 📞 Support

If you need help with testing or find issues:
- Check the plugin documentation
- Review console errors (F12 → Console)
- Test with debug mode enabled
- Try minimal test cases first
