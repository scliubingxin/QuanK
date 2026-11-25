// [ux9] Built-in setup guides for each connector, returned to the model when it helps the user add one from chat.
// docs are documentation portals only; the model searches (app_web_search) for the exact current page before quoting steps.
export const CONNECTOR_GUIDES = {
  feed: {title: '网页 / RSS 订阅', steps: ['只需要网址：RSS / Atom 地址，或要跟踪变化的普通网页地址。', '不需要账号密码，QuankSight 会直接添加并立即同步一次。'], docs: []},
  'calendar:ics': {title: '日历订阅链接', steps: ['Outlook：设置 → 日历 → 共享日历 → 发布日历，复制 ICS 链接。', 'Google 日历：设置 → 选中日历 → 集成日历 → 「iCal 格式的私密地址」。', '飞书：日历 → 设置 → 订阅 / 导出，复制 CalDAV 或订阅链接。', '订阅链接不需要密码，可以直接添加。'],
    docs: ['https://support.google.com/calendar/']},
  'calendar:caldav': {title: 'CalDAV 日历账号', steps: ['飞书：设置 → 日历 → CalDAV 同步，生成用户名和专用密码，服务器 caldav.feishu.cn。', 'iCloud：appleid.apple.com → 登录与安全 → App 专用密码，服务器 caldav.icloud.com。', '专用密码需要你本人在弹出的表单里填写，我不会经手密码。'],
    docs: ['https://www.feishu.cn/hc/zh-CN/', 'https://support.apple.com/zh-cn/']},
  mail: {title: '邮箱（IMAP 只读同步）', steps: ['QQ 邮箱：网页版 → 设置 → 账号 → 开启「IMAP/SMTP 服务」→ 按提示发短信 → 得到 16 位授权码。', '163 / 126：设置 → POP3/SMTP/IMAP → 开启 IMAP/SMTP 服务 → 新增授权密码。', '腾讯企业邮箱：设置 → 客户端设置 → 开启 IMAP/SMTP，并在「微信绑定 → 客户端专用密码」生成密码。', 'Gmail：开启两步验证后在 myaccount.google.com/apppasswords 生成应用专用密码。', '授权码需要你本人在弹出的表单里填写，我不会经手密码。'],
    docs: ['https://service.mail.qq.com/', 'https://help.mail.163.com/', 'https://support.google.com/mail/']},
  'office:feishu': {title: '飞书', steps: ['打开飞书开放平台 open.feishu.cn/app → 「创建企业自建应用」。', '「凭证与基础信息」里复制 App ID（cli_ 开头）和 App Secret。', '「添加应用能力」→ 机器人；「权限管理」里搜索并开通获取群组信息、读取群消息相关的权限（具体名称以开放平台权限列表为准）。', '「版本管理与发布」→ 创建版本并申请发布（企业管理员审核通过后生效）。', '把机器人拉进要同步的群。', '要发群消息：群设置 → 群机器人 → 添加自定义机器人，复制 Webhook；开启「签名校验」时一并复制密钥。'],
    docs: ['https://open.feishu.cn/document/']},
  'office:dingtalk': {title: '钉钉', steps: ['打开钉钉开放平台 open-dev.dingtalk.com → 应用开发 → 企业内部应用 → 创建应用（需要管理员或开发者权限）。', '「凭证与基础信息」里复制 Client ID（即 AppKey）和 Client Secret（即 AppSecret）。', '注意：钉钉开放接口不提供读取群聊记录，QuankSight 用应用凭证只做校验；同步群消息目前不可用。', '要发群消息：群设置 → 机器人 → 添加机器人 → 自定义（Webhook）→ 安全设置选「加签」，复制 SEC 开头的密钥和 Webhook 地址。', '凭证和密钥需要你本人在弹出的表单里填写，我不会经手。'],
    docs: ['https://open.dingtalk.com/document/']},
  'office:wecom': {title: '企业微信', steps: ['企业微信管理后台 work.weixin.qq.com → 我的企业 → 企业信息，复制「企业 ID」。', '应用管理 → 自建 → 创建应用，复制应用 Secret（需管理员）。', '注意：企业微信开放接口不提供读取群聊记录（会话存档需单独购买），QuankSight 用凭证只做校验。', '要发群消息：群聊 → 右上角 → 群机器人 → 添加，复制 Webhook 地址。'],
    docs: ['https://developer.work.weixin.qq.com/document/']},
};
export function guideFor(kind, config = {}) {
  const key = kind === 'calendar' ? `calendar:${config.mode === 'caldav' ? 'caldav' : 'ics'}` : kind === 'office' ? `office:${['feishu', 'dingtalk', 'wecom'].includes(config.platform) ? config.platform : 'feishu'}` : kind;
  return CONNECTOR_GUIDES[key] || null;
}
