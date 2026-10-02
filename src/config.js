export const DEFAULT_CONFIG = {
  defaultOwner: 'davoodmehraban89',
  defaultRepos: [
    { id: 'Factor-easy', name: 'Factor-easy', title: 'Factor-easy (سیستم فاکتور)' },
    { id: 'Finora-Invoice', name: 'Finora-Invoice', title: 'Finora-Invoice (پلتفرم مالی)' },
    { id: 'AvanTech', name: 'AvanTech', title: 'AvanTech (سیستم سازمانی)' },
    { id: 'Aram', name: 'Aram', title: 'Aram (پروژه آرام)' }
  ],
  systemServices: [
    { name: 'Cloudflare Worker (Webhook)', status: '🟢 Active (100% SLA)' },
    { name: 'GitHub API Connection', status: '🟢 Connected' },
    { name: 'State Management Store', status: '🟢 Operational (In-Memory / KV)' },
    { name: 'CI/CD Pipeline Runner', status: '🟡 Idle / Monitoring' }
  ],
  devTools: [
    { id: 'ping', title: '🏓 تست اتصال (Ping)', desc: 'تست پینگ به ورکر و سرور تلگرام' },
    { id: 'cache_clear', title: '🧹 پاکسازی کش (Clear Cache)', desc: 'ریست وضعیت موقت منوها' },
    { id: 'webhook_info', title: '🔗 بررسی وضعیت وب‌هوک', desc: 'استعلام اطلاعات webhook از تلگرام' }
  ],
  securityStatus: {
    status: '🛡️ فعال و ایمن',
    tokenType: 'Fine-grained Personal Access Token (Nexa Dev GitHub Access)',
    allowedUsers: ['davoodmehraban89'],
    rateLimit: '5000 req/hr (Standard GitHub API)'
  }
};
