import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Scenario = 'normal' | 'not_found' | 'validation' | 'permission' | 'transient' | 'expired' | 'slow' | 'dialog' | 'app_error';
const style = `body{font:16px Georgia,serif;background:#f2f0e9;color:#203039;margin:0}header{background:#203039;color:white;padding:22px 36px}main{padding:28px 36px}table{border-collapse:collapse;width:100%}td,th{padding:14px;text-align:left;border-bottom:1px solid #c5c8bf}button,input{font:inherit;padding:10px 14px;margin:8px 0}button{background:#155c57;color:white;border:0;cursor:pointer}aside{padding:14px;background:#e9ddb7}iframe{border:0;width:100%;height:620px}small{font:12px monospace}`;
const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Northstar Legacy Console</title><style>${style}</style></head><body>${body}</body></html>`;

export async function startDemo(scenario: Scenario = 'normal', port = 0): Promise<{ server: Server; origin: string; close(): Promise<void> }> {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/') return res.end(page('<header><small>NORTHSTAR / TRAINING ENVIRONMENT / v1</small><h1>Member servicing</h1></header><iframe name="workspace" title="Servicing workspace" src="/workspace"></iframe>'));
    if (req.url !== '/workspace') { res.statusCode = 404; return res.end('Not found'); }
    res.end(page(`<main><aside>Synthetic records only. No real accounts or transactions.</aside><div id="screen"></div></main><script>
    const scenario=${JSON.stringify(scenario)};
    const screen=document.getElementById('screen'); let member='', retried=false, expired=false;
    function search(){screen.innerHTML='<h2>Member search</h2><table><tr><td><label for="member">Member ID</label></td><td><input id="member" autocomplete="off"></td></tr></table><button id="search">Search</button>'; document.getElementById('search').onclick=()=>{member=document.getElementById('member').value; find()}}
    function find(){
      if(scenario==='dialog'){alert('Unexpected confirmation');return}
      if(scenario==='validation'||!/^M[0-9]{3}$/.test(member)){screen.innerHTML='<h2>Invalid member ID</h2>';return}
      if(scenario==='not_found'||!['M001','M002'].includes(member)){screen.innerHTML='<h2>Member not found</h2>';return}
      if(scenario==='permission'){screen.innerHTML='<h2>Permission denied</h2>';return}
      if(scenario==='app_error'){screen.innerHTML='<h2>Application unavailable</h2>';return}
      if(scenario==='transient'&&!retried){screen.innerHTML='<h2>Temporarily unavailable</h2><button id="retry">Retry lookup</button>';document.getElementById('retry').onclick=()=>{retried=true;find()};return}
      if(scenario==='slow'){screen.innerHTML='<h2>Loading member</h2>';setTimeout(results,300);return} results()
    }
    function results(){screen.innerHTML='<h2>Search results</h2><table><tr><th>Member</th><th>Action</th></tr><tr><td><span id="mid"></span></td><td><button id="open">Open member</button></td></tr></table>';document.getElementById('mid').textContent=member;document.getElementById('open').onclick=detail}
    function detail(){if(scenario==='expired'&&!expired){screen.innerHTML='<h2>Session expired</h2><p>An operator must restore this training session.</p><button id="restore">Restore training session</button>';document.getElementById('restore').onclick=()=>{expired=true;detail()};return}
      screen.innerHTML='<h2>Member overview</h2><table><tr><th>Product</th><th>Balance</th></tr><tr><td>Savings</td><td><span role="status" aria-label="Savings balance"></span></td></tr></table><button id="review">Review savings</button><button id="close">Close account</button>';document.querySelector('[role="status"]').textContent=member==='M001'?'1250.50':'9820.75';document.getElementById('review').onclick=review;document.getElementById('close').onclick=()=>{screen.innerHTML='<h2>Account closed</h2>'}}
    function review(){screen.innerHTML='<h2>Savings review</h2><p>Read-only servicing checkpoint</p><table><tr><td>Savings balance</td><td><span role="status" aria-label="Savings balance"></span></td></tr></table>';document.querySelector('[role="status"]').textContent=member==='M001'?'1250.50':'9820.75'}
    search();</script>`));
  });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
