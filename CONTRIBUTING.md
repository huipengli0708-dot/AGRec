# 参与贡献 AGRec

感谢你愿意花时间帮 AGRec 变得更好。这是一个个人维护的开源项目，欢迎任何形式的贡献。

## 提交 Bug / 建议

请先在 [Issues](https://github.com/huipengli0708-dot/AGRec/issues) 里搜索有没有类似的反馈，没有的话直接新建一个，尽量带上：

- 你的 macOS 版本、AGRec 版本
- 复现步骤，最好有截图或录屏
- 期望的结果 vs 实际的结果

## 提交代码

1. Fork 本仓库，新建分支（例如 `fix/xxx`、`feat/xxx`）
2. 参照 [README 的"从源码构建"章节](README.md#从源码构建) 跑起来本地环境
3. 改完后确认 `npm run build` 和 Xcode 侧的 Swift 编译都能通过
4. 提交 PR，说明改了什么、为什么改

代码风格上没有强制的 lint 规则，但请尽量跟现有代码保持一致（TypeScript/React 用现有的组件写法，Rust/Swift 侧遵循已有命名习惯）。

## 不接受的范围

- 不会接入任何形式的数据收集/统计 SDK
- 不会做付费/订阅相关的功能

有疑问欢迎先开一个 Issue 讨论，再动手写代码，避免白做工。
