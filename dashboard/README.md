# Dashboard

V1 不实现 Web 看板。

## V1 查询方式

V1 使用 `sqlite3` 命令行和手写 SQL 查看数据：

```powershell
sqlite3 metrics/runs.sqlite
```

常用查询见 `metrics/README.md`。

## V2 方向

后续可以考虑做 HTML/Web 看板，例如：

- Next.js
- Streamlit

V1 暂不创建前端项目、不安装依赖、不写看板代码。
