import { GuidedNexaDevBot } from './guide-bot.js';
import { DurableWorkspaceStoreClient } from './core/workspace-store.js';
import { handleWorkspaceEditorRequest, workspaceEditorPageResponse } from './workspace-editor.js';
export { ApprovalReplayGuard } from './durable/approval-replay-guard.js';
export { WorkspaceStore } from './durable/workspace-store.js';
export { IncidentStore } from './durable/incident-store.js';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const publicHealthPayload = () => ({ status: 'online', bot: 'Nexa Dev Bot', version: '1.1.1', mode: 'Cloudflare Worker Webhook' });
function senderIdFromUpdate(update) { return update?.message?.from?.id ?? update?.callback_query?.from?.id ?? null; }
function isOwnerUpdate(update, env) { if (!env.OWNER_TELEGRAM_ID) return false; const senderId = senderIdFromUpdate(update); return senderId !== null && String(senderId) === String(env.OWNER_TELEGRAM_ID); }
function safeErrorMessage(error, env = {}) { let message=String(error?.message||'Unknown error'); for(const secret of [env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_WEBHOOK_SECRET,env.GITHUB_TOKEN,env.CLOUDFLARE_API_TOKEN,env.APPROVAL_SIGNING_SECRET]){const value=String(secret||'');if(value)message=message.split(value).join('[REDACTED]');} return message; }
export default { async fetch(request,env={},ctx={}) { const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/workspace/editor')return workspaceEditorPageResponse();
  if(url.pathname==='/workspace/api/editor'&&(request.method==='GET'||request.method==='PUT')){const workspaces=new DurableWorkspaceStoreClient({namespace:env.WORKSPACE_STORE});return handleWorkspaceEditorRequest(request,{workspaces,botToken:env.TELEGRAM_BOT_TOKEN||'',ownerId:env.OWNER_TELEGRAM_ID||''});}
  if(request.method==='GET'){if(url.pathname==='/health'||url.pathname==='/'||url.pathname==='/status')return jsonResponse(publicHealthPayload());return new Response('Not Found',{status:404});}
  if(request.method==='POST'&&url.pathname==='/telegram/webhook'){if(!env.TELEGRAM_WEBHOOK_SECRET)return new Response('Webhook secret not configured',{status:503});if(request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)return new Response('Forbidden',{status:403});if(!env.OWNER_TELEGRAM_ID)return new Response('Owner not configured',{status:503});if(!env.TELEGRAM_BOT_TOKEN)return new Response('Telegram bot token not configured',{status:503});try{const update=await request.json();if(!isOwnerUpdate(update,env))return jsonResponse({ok:true,ignored:true});const bot=new GuidedNexaDevBot(env);return jsonResponse(await bot.handleUpdate(update));}catch(err){console.error('telegram_webhook_error',safeErrorMessage(err,env));return jsonResponse({ok:false,error:'Telegram webhook processing failed'},400);}}
  if(request.method==='POST')return new Response('Not Found',{status:404}); return new Response('Method Not Allowed',{status:405}); } };
