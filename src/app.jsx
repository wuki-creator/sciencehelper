import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { icons } from 'lucide';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './app.css';
import './shell.css';

const h = React.createElement;
    const BASE = location.pathname.startsWith('/paperpilot') ? '/paperpilot' : '';
    const api = async (url, options={}) => { let response;try{response=await fetch(BASE+url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});}catch(error){if(error.name==='AbortError')throw error;throw new Error('网络连接中断，请重试');}const data=await response.json();if(!response.ok){const error=new Error(data.error||'请求失败');error.status=response.status;throw error;}return data; };
    const money = value => `¥${Number(value || 0).toLocaleString('zh-CN')}`;
    const icon = (name, size = 18) => { const key = name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(''); return h('svg', { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.7, strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':true, className:'app-icon' }, (icons[key] || icons.CircleHelp)[2].map(([tag, attrs], index) => h(tag, {...attrs, key:index}))); };

    const emptyState = { reagents:[], cart:[], orders:[], merchantOrders:[], researchProjects:[], researchTasks:[], labProviders:[], labRequests:[], settings:{} };
    const routes = {research:['研究方案','git-branch'],market:['试剂商城','store'],labs:['实验服务','building-2'],orders:['购买记录','receipt-text'],merchant:['商家工作台','package-plus'],labAdmin:['实验室后台','clipboard-list'],insights:['产品洞察','chart-no-axes-combined'],more:['我的工作区','layout-grid'],marketAdmin:['商城运营后台','layout-dashboard'],modelAdmin:['模型管理后台','brain-circuit']};
    const currentRoute = () => Object.hasOwn(routes, location.hash.slice(1)) ? location.hash.slice(1) : 'research';
    function App() {
      const [view, setView] = useState(currentRoute);
      const [state, setState] = useState(emptyState);
      const [modal, setModal] = useState(null);
      const [toast, setToast] = useState('');
      const [user, setUser] = useState(null);
      const [authLoading, setAuthLoading] = useState(true);
      const [connectionError, setConnectionError] = useState('');
      const [dataLoading, setDataLoading] = useState(false);
      const contentRef = useRef(null);
      const refresh = useCallback(async () => {
        setDataLoading(true);
        try { const data = await api('/api/state'); setState(data); setConnectionError(''); }
        catch (error) { if (error.status === 401) { setUser(null); setState(emptyState); setModal(null); } else setConnectionError('工作区暂时无法加载，请重试。'); throw error; }
        finally { setDataLoading(false); }
      }, []);
      const loadAccount = async () => {
        setAuthLoading(true); setConnectionError('');
        try { const data = await api('/api/me'); setUser(data.user); }
        catch (error) { if (error.status === 401) setUser(null); else setConnectionError('暂时无法连接服务器，请检查网络后重试。'); }
        finally { setAuthLoading(false); }
      };
      useEffect(() => { loadAccount(); }, []);
      useEffect(() => { if (user) refresh().catch(() => {}); }, [user, refresh]);
      useEffect(() => { const change = () => setView(currentRoute()); window.addEventListener('hashchange',change); return () => window.removeEventListener('hashchange',change); }, []);
      useEffect(() => { if (toast) { const timeout = setTimeout(() => setToast(''),3500); return () => clearTimeout(timeout); } }, [toast]);
      const navigate = next => { location.hash=next; setView(next); contentRef.current?.scrollTo({top:0}); };
       const logout = async () => { try { await api('/api/auth/logout',{method:'POST'}); setUser(null); setState(emptyState); setModal(null); navigate('research'); } catch(error) { setToast('退出失败，请检查网络后重试。'); } };
      const addToCart = async (reagentId, quantity=1) => { try { await api('/api/cart',{method:'POST',body:JSON.stringify({reagentId,quantity})}); await refresh(); setToast('已加入购物清单'); } catch(error) { setToast(error.message); } };
      if (authLoading) return <div className="loading-screen"><Brand/><span className="loading-pulse">正在打开工作区…</span></div>;
      if (!user) return <AuthScreen onAuthenticated={setUser} connectionError={connectionError} retry={loadAccount}/>;
      const cartCount=state.cart.reduce((sum,item)=>sum+item.quantity,0);
      if (view==='marketAdmin'||view==='modelAdmin') return <AdminShell view={view} state={state} user={user} navigate={navigate} refresh={refresh} setToast={setToast} logout={logout}/>;
      return <div className="app">
        <Sidebar view={view} navigate={navigate} user={user} state={state}/>
        <div className="content">
          <Topbar view={view} user={user} navigate={navigate} setModal={setModal} cartCount={cartCount}/>
          {connectionError && <div className="connection-error" role="alert">{connectionError}<button onClick={()=>refresh().catch(()=>{})}>重新加载</button></div>}
          <main ref={contentRef} className="main" aria-busy={dataLoading}>
             {view==='research' && <ResearchWorkflow state={state} refresh={refresh} navigate={navigate} setModal={setModal} setToast={setToast}/>} 
            {view==='market' && <Market state={state} addToCart={addToCart} refresh={refresh} setModal={setModal} setToast={setToast}/>}
             {view==='labs' && <Labs state={state} setModal={setModal}/>} 
             {view==='merchant' && <Merchant state={state} user={user} refresh={refresh} setToast={setToast} setModal={setModal}/>}
             {view==='labAdmin' && <LabAdmin state={state} refresh={refresh} setToast={setToast}/>} 
            {view==='orders' && <Orders state={state} navigate={navigate} setModal={setModal} setToast={setToast}/>}
            {view==='insights' && <Insights navigate={navigate}/>}
            {view==='more' && <More user={user} navigate={navigate} logout={logout} state={state}/>}
            <Footer/>
          </main>
        </div>
        <MobileNav view={view} navigate={navigate}/>
        {modal && <ModalRouter modal={modal} state={state} setModal={setModal} refresh={refresh} setToast={setToast}/>}
        {toast && <div className="toast" role="status">{icon('check',16)}{toast}</div>}
      </div>;
    }
    function Brand() { return <div className="brand"><div className="brand-mark">{icon('flask-conical',19)}</div><div><strong>PaperPilot<span className="brand-dot">.</span></strong><small>你的科研搭档</small></div></div>; }
    function AuthScreen({onAuthenticated,connectionError,retry}) {
      const [mode,setMode]=useState('login');
      const [form,setForm]=useState({name:'',email:'',password:''});
      const [error,setError]=useState('');
      const [loading,setLoading]=useState(false);
      const [showPassword,setShowPassword]=useState(false);
      const change=event=>setForm({...form,[event.target.name]:event.target.value});
      const submit=async event=>{event.preventDefault();setLoading(true);setError('');try {const data=await api('/api/auth/'+mode,{method:'POST',body:JSON.stringify(form)});onAuthenticated(data.user);}catch(requestError){setError(requestError.message);}finally{setLoading(false);}};
      return <div className="auth-page"><div className="auth-shell">
        <section className="auth-story"><Brand/><div className="auth-story-content"><div className="auth-symbol">{icon('flask-conical',48)}</div><h1>让科研想法，<br/>走进实验室。</h1><p>从读懂一篇论文，到找到合适的试剂和实验室。<br/>在一个工作区里，推进你的研究。</p><div className="auth-flow"><span>{icon('file-text')}文献</span>{icon('arrow-right',16)}<span>{icon('messages-square')}理解</span>{icon('arrow-right',16)}<span>{icon('flask-conical')}实验</span></div></div><span className="auth-caption">研究有据，探索有伴。</span></section>
        <section className="auth-panel"><form className="auth-card" onSubmit={submit}><div className="auth-mobile-brand"><Brand/></div><h2>{mode==='login'?'欢迎回来':'开启你的科研工作区'}</h2><p className="sub">{mode==='login'?'登录 PaperPilot，继续你的探索。':'创建账户，开始构建研究方案。'}</p><div className="auth-tabs" aria-label="账户操作">{['login','register'].map(value=><button key={value} type="button" aria-pressed={mode===value} className={mode===value?'active':''} onClick={()=>{setMode(value);setError('');}} disabled={loading}>{value==='login'?'登录':'注册'}</button>)}</div>
        {(error||connectionError)&&<div className="auth-error" role="alert">{error||connectionError}{connectionError&&<button type="button" onClick={retry}>重试</button>}</div>}
        {mode==='register'&&<div className="field"><label htmlFor="auth-name">怎么称呼你</label><input id="auth-name" name="name" value={form.name} onChange={change} minLength={2} maxLength={60} autoComplete="name" placeholder="你的姓名或昵称" required/></div>}
        <div className="field"><label htmlFor="auth-email">邮箱</label><input id="auth-email" name="email" type="email" value={form.email} onChange={change} autoComplete="email" placeholder="you@example.com" required/></div>
        <div className="field"><label htmlFor="auth-password">密码</label><div className="password-field"><input id="auth-password" name="password" type={showPassword?'text':'password'} value={form.password} onChange={change} autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} maxLength={128} placeholder="至少 8 位字符" required/><button type="button" aria-label={showPassword?'隐藏密码':'显示密码'} onClick={()=>setShowPassword(!showPassword)}>{icon(showPassword?'eye-off':'eye',18)}</button></div></div>
        <button className="btn btn-primary auth-submit" disabled={loading}>{loading?'正在处理…':mode==='login'?'登录工作区':'注册并进入工作区'}{!loading&&icon('arrow-right',18)}</button><p className="auth-note">{icon('lock-keyhole',14)}你的密码采用加密摘要保存</p></form></section>
      </div><Footer/></div>;
    }
    function Sidebar({view,navigate,user,state}) {
       const groups=[['研究工作台',['research']],['采购与实验',['market','labs','orders']]];
       return <aside className="sidebar"><Brand/><button className="btn new-chat" onClick={()=>navigate('research')}>{icon('plus',18)}新研究方案<span>+</span></button>{groups.map(([label,items])=><div className="nav-group" key={label}><div className="nav-label">{label}</div><nav className="nav" aria-label={label}>{items.map(id=><button key={id} aria-current={view===id?'page':undefined} className={view===id?'active':''} onClick={()=>navigate(id)}>{icon(routes[id][1])}<span>{routes[id][0]}</span></button>)}</nav></div>)}<div className="sidebar-spacer"/><div className="sidebar-library">{icon('library',18)}<div><strong>研究证据，随时回看</strong><span>已生成 {state.researchProjects.length} 个方案</span></div><button aria-label="查看研究方案" onClick={()=>navigate('research')}>{icon('arrow-up-right',16)}</button></div><nav className="nav"><button className={view==='merchant'?'active':''} onClick={()=>navigate('merchant')}>{icon('package-plus')}商家工作台</button><button className={view==='labAdmin'?'active':''} onClick={()=>navigate('labAdmin')}>{icon('clipboard-list')}实验室后台</button><button className={view==='marketAdmin'?'active':''} onClick={()=>navigate('marketAdmin')}>{icon('layout-dashboard')}商城运营后台</button><button className={view==='modelAdmin'?'active':''} onClick={()=>navigate('modelAdmin')}>{icon('brain-circuit')}模型管理后台</button><button className={view==='more'?'active':''} onClick={()=>navigate('more')}>{icon('layout-grid')}更多功能</button></nav><button className="profile" onClick={()=>navigate('more')}><div className="avatar">{user.name.slice(0,1)}</div><div><strong>{user.name}</strong><span>我的工作区</span></div>{icon('chevrons-up-down',15)}</button></aside>;
    }

    function AdminShell({view,state,user,navigate,refresh,setToast,logout}) {
      const market = view === 'marketAdmin';
      const navItems = market ? [['marketAdmin','总览','layout-dashboard'],['merchant','商品与供应商','package-plus'],['orders','订单与履约','receipt-text'],['insights','经营洞察','chart-no-axes-combined']] : [['modelAdmin','模型总览','brain-circuit'],['modelAdmin','版本与流量','git-branch'],['modelAdmin','评测记录','clipboard-check'],['modelAdmin','运行日志','scroll-text']];
      return <div className="admin-app"><aside className="admin-sidebar"><div className="admin-brand"><div className="brand-mark">{icon(market?'store':'brain-circuit',19)}</div><div><strong>{market?'PaperPilot Commerce':'PaperPilot Models'}</strong><span>{market?'商城运营控制台':'研究模型控制台'}</span></div></div><div className="admin-workspace-label">{market?'COMMERCE OPS':'MODEL OPS'}</div><nav className="admin-nav" aria-label="后台导航">{navItems.map(([id,label,iconName],index)=><button key={`${id}-${label}-${index}`} className={index===0?'active':''} onClick={()=>navigate(id)}>{icon(iconName,17)}<span>{label}</span>{index===0&&<i/>}</button>)}</nav><div className="admin-sidebar-bottom"><button className="admin-back" onClick={()=>navigate('market')}>{icon('arrow-left',16)}返回用户端</button><button className="admin-user" onClick={()=>navigate('more')}><span className="avatar">{user.name.slice(0,1)}</span><span><strong>{user.name}</strong><small>管理员工作区</small></span>{icon('chevrons-up-down',15)}</button></div></aside><div className="admin-content"><header className="admin-topbar"><div><span className="admin-kicker">{market?'COMMERCE / INTERNAL':'MODEL OPS / INTERNAL'}</span><h1>{market?'商城运营后台':'模型管理后台'}</h1></div><div className="admin-top-actions"><span className="admin-status"><i/>系统运行正常</span><button className="icon-btn" aria-label="退出登录" title="退出登录" onClick={logout}>{icon('log-out',17)}</button></div></header><main className="admin-main">{market?<MarketAdmin state={state} navigate={navigate} refresh={refresh} setToast={setToast}/>:<ModelAdmin state={state} refresh={refresh} setToast={setToast}/>}</main></div></div>;
    }
    function Topbar({view,navigate,cartCount,setModal,user}) {return <header className="topbar"><div className="breadcrumb"><span className="desktop-only">工作区</span><span className="desktop-only">/</span><strong>{routes[view][0]}</strong>{view==='research'&&<span className="agent-badge">2 Agents</span>}</div><div className="top-actions"><button className="icon-btn" title="购物清单" aria-label={`购物清单，${cartCount} 件商品`} onClick={()=>setModal({type:'cart'})}>{icon('shopping-basket',19)}{cartCount>0&&<span className="cart-count">{cartCount}</span>}</button><button className="header-avatar" aria-label="我的账户" onClick={()=>navigate('more')}>{user.name.slice(0,1)}</button></div></header>;}
    function MobileNav({view,navigate}) {const items=['research','market','labs','orders','more'];const labels=['方案','商城','实验','订单','我的'];return <nav className="mobile-nav" aria-label="主要功能">{items.map((id,index)=><button key={id} aria-current={(view===id||id==='more'&&!items.includes(view))?'page':undefined} className={(view===id||id==='more'&&!items.includes(view))?'active':''} onClick={()=>navigate(id)}>{icon(routes[id][1],21)}<span>{labels[index]}</span></button>)}</nav>;}
    function More({user,state,navigate,logout}) {return <div className="view-shell account-view"><div className="account-summary"><div className="avatar">{user.name.slice(0,1)}</div><div><h1>{user.name}</h1><p>{user.email}</p></div></div><div className="account-links">{['orders','merchant','labAdmin','marketAdmin','modelAdmin','insights'].map(id=><button key={id} onClick={()=>navigate(id)}>{icon(routes[id][1],21)}<span>{routes[id][0]}</span>{icon('chevron-right',17)}</button>)}</div><section className="install-tip"><div>{icon('smartphone',24)}<h3>把 PaperPilot 放在主屏幕</h3></div><p>在手机浏览器菜单中选择“添加到主屏幕”，下次轻点图标就能打开工作区。</p></section><button className="btn btn-quiet logout-button" onClick={logout}>{icon('log-out',17)}退出登录</button></div>;}
    function Footer() { return <footer className="site-footer"><span>© 2026 深圳华海里生物科技有限公司</span><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">粤ICP备2026020480号</a></footer>; }

    function ResearchWorkflow({state,refresh,navigate,setModal,setToast}) {
      const [topic,setTopic]=useState('');
      const [project,setProject]=useState(state.researchProjects?.[0]||null);
      const [loading,setLoading]=useState(false);
      const [phase,setPhase]=useState('');
      const [selection,setSelection]=useState({methods:[],resources:[]});
      const requestRef=useRef(null);
      useEffect(()=>{if(!project&&state.researchProjects?.length)setProject(state.researchProjects[0]);},[state.researchProjects,project]);
      useEffect(()=>()=>requestRef.current?.abort(),[]);
      const run=async event=>{
        event?.preventDefault();if(topic.trim().length<4||loading)return;
        const controller=new AbortController();requestRef.current=controller;setLoading(true);setPhase('正在生成英文检索式并检索 PubMed…');setSelection({methods:[],resources:[]});
        const phaseTimer=setTimeout(()=>setPhase('正在读取开放全文并由 Methods 智能体归纳…'),4500);
        try{const data=await api('/api/research/workflows',{method:'POST',body:JSON.stringify({topic:topic.trim()}),signal:controller.signal});setProject(data.project);await refresh();setTopic('');setToast(`已从 PubMed 整理 ${data.project.papers.length} 篇文献`);}catch(error){if(error.name!=='AbortError')setToast(error.message);}finally{clearTimeout(phaseTimer);setLoading(false);setPhase('');requestRef.current=null;}
      };
      const publishDirect=async()=>{if(topic.trim().length<4||loading)return;setLoading(true);try{await api('/api/research/tasks',{method:'POST',body:JSON.stringify({topic:topic.trim()})});await refresh();setTopic('');setToast('科研任务已发布，可去商城选择试剂');}catch(error){setToast(error.message);}finally{setLoading(false);}};
      const methodSelected=id=>selection.methods.includes(id);
      const resourceKey=(node,type,index)=>`${node.id}:${type}:${index}`;
      const toggleMethod=node=>setSelection(current=>{const active=!current.methods.includes(node.id);const nodeKeys=[...node.reagents.map((_,index)=>resourceKey(node,'reagent',index)),...node.materials.map((_,index)=>resourceKey(node,'material',index))];return{methods:active?[...current.methods,node.id]:current.methods.filter(id=>id!==node.id),resources:active?[...new Set([...current.resources,...nodeKeys])]:current.resources.filter(key=>!nodeKeys.includes(key))};});
      const toggleResource=key=>setSelection(current=>({...current,resources:current.resources.includes(key)?current.resources.filter(item=>item!==key):[...current.resources,key]}));
      const selectedMethods=project?.methodTree?.filter(node=>selection.methods.includes(node.id)).map(node=>node.name)||[];
      const selectedCatalogIds=[...new Set((project?.methodTree||[]).flatMap(node=>node.reagents.map((item,index)=>selection.resources.includes(resourceKey(node,'reagent',index))?item.catalogId:null)).filter(Boolean))];
      const addSelectedToCart=async()=>{if(!selectedCatalogIds.length){setToast('所选试剂暂未匹配商城商品');return;}try{for(const reagentId of selectedCatalogIds)await api('/api/cart',{method:'POST',body:JSON.stringify({reagentId,quantity:1,projectId:project.id})});await refresh();setToast(`已将 ${selectedCatalogIds.length} 个目录商品加入购物清单`);}catch(error){setToast(error.message);}};
      const publishedTask=state.researchTasks.find(task=>task.projectId===project?.id);
      const publishTask=async()=>{if(!project||publishedTask)return;try{await api('/api/research/tasks',{method:'POST',body:JSON.stringify({projectId:project.id})});await refresh();setToast('科研任务已发布，可从方案选择试剂进入采购');}catch(error){setToast(error.message);}};
      const chooseProject=item=>{setProject(item);setSelection({methods:[],resources:[]});};
      return <div className="view-shell research-view">
        <section className="research-brief">
          <div><div className="eyebrow">PUBMED → METHODS → EXPERIMENT</div><h1>把一个课题，变成可执行的实验路径</h1><p>两个智能体协作检索 5 篇高相关文献，按证据拆解 Methods，并把试剂、材料、采购与实验委托接在同一棵树上。</p></div>
          <form onSubmit={run} className="research-prompt"><label htmlFor="research-topic">你的科研课题</label><div><textarea id="research-topic" value={topic} onChange={event=>setTopic(event.target.value)} placeholder="例如：肺组织单细胞测序中，怎样提高免疫细胞回收率？" rows={3}/><button className="btn btn-primary" disabled={loading||topic.trim().length<4}>{loading?icon('loader-circle',18):icon('sparkles',18)}{loading?'正在研究':'生成研究方案'}</button></div><div className="research-publish-row"><button type="button" className="btn btn-quiet btn-sm" disabled={loading||topic.trim().length<4} onClick={publishDirect}>{icon('send',15)}直接发布科研任务</button><span>或检索 PubMed / Europe PMC，生成文献支持的方案。</span></div></form>
        </section>
        {!!state.researchTasks.length&&<section className="research-task-list"><strong>已发布科研任务</strong>{state.researchTasks.slice(0,5).map(task=><div key={task.id}><span>{task.topic}</span><button className="btn btn-quiet btn-sm" onClick={()=>navigate('market')}>去商城采购{icon('arrow-right',14)}</button></div>)}</section>}
        {(loading||project)&&<div className="agent-rail" aria-live="polite">
          <div className={loading?'running':'complete'}><span>{loading?icon('loader-circle',17):icon('check',17)}</span><div><strong>智能体 1 · 文献检索</strong><small>{loading?'正在筛选相关度最高的论文':`${project?.papers?.length||0} 篇 PubMed 文献已入选`}</small></div></div>
          <i/>
          <div className={loading?'queued':'complete'}><span>{loading?icon('scan-search',17):icon('check',17)}</span><div><strong>智能体 2 · Methods 解析</strong><small>{loading?phase||'等待文献证据':`${project?.methodTree?.length||0} 个方法节点已按顺序归纳`}</small></div></div>
          {loading&&<button className="btn btn-quiet btn-sm" onClick={()=>requestRef.current?.abort()}>停止</button>}
        </div>}
        {!project&&!loading&&<section className="research-empty"><div className="research-empty-graphic">{icon('git-branch',34)}<span>01</span><i/><span>02</span><i/><span>03</span></div><h2>从一个清楚的研究问题开始</h2><p>系统会保留每个方法和试剂对应的文献编号，帮助你回到原文复核，而不是只给一段无法追溯的答案。</p></section>}
        {project&&<>
          <div className="research-project-bar"><div><span>当前方案</span><strong>{project.topic}</strong><small>{new Date(project.createdAt).toLocaleString('zh-CN',{hour12:false})} · 检索式：{project.searchQuery}</small></div><div className="research-task-actions">{state.researchProjects.length>1&&<select aria-label="切换历史研究方案" value={project.id} onChange={event=>chooseProject(state.researchProjects.find(item=>item.id===event.target.value))}>{state.researchProjects.map(item=><option key={item.id} value={item.id}>{item.topic}</option>)}</select>}<button className="btn btn-primary btn-sm" disabled={Boolean(publishedTask)} onClick={publishTask}>{icon(publishedTask?'check':'send',15)}{publishedTask?'科研任务已发布':'发布科研任务'}</button></div></div>
          <section className="evidence-section">
            <div className="research-section-head"><div><span>01 · EVIDENCE</span><h2>5 篇 PubMed 证据</h2></div><p>{project.evidenceNote}</p></div>
            <div className="paper-evidence-list">{project.papers.map(paper=><details key={paper.id}><summary><span className="paper-rank">{String(paper.rank).padStart(2,'0')}</span><div><strong>{paper.title}</strong><small>{paper.journal} · {paper.year} · PMID {paper.pmid}</small></div><span className={`evidence-source ${paper.methodsText?'full':''}`}>{paper.methodsText?'全文 Methods':'摘要'}</span>{icon('chevron-down',17)}</summary><div className="paper-evidence-body"><p><strong>作者：</strong>{paper.authors||'PubMed 未列出'}</p><p>{paper.methodsText||paper.abstract||'PubMed 暂无可显示摘要。'}</p><a href={paper.url} target="_blank" rel="noopener noreferrer">在 PubMed 查看原文{icon('arrow-up-right',14)}</a></div></details>)}</div>
          </section>
          <section className="methods-workbench">
            <div className="research-section-head"><div><span>02 · METHOD MAP</span><h2>Methods 分类与实验顺序</h2></div><p>{project.summary}</p></div>
            <div className="method-category-strip">{project.methodCategories.map(item=><div key={item.name}><strong>{item.name}</strong><span>{item.methodCount} 个步骤 · {item.reagentCount} 种试剂 · {item.supportCount} 篇支持</span></div>)}</div>
            <div className="method-workspace-grid"><div className="method-tree">{project.methodTree.map((node,index)=><article className={`method-node ${methodSelected(node.id)?'selected':''}`} key={node.id}>
              <div className="method-branch"><span>{String(index+1).padStart(2,'0')}</span>{index<project.methodTree.length-1&&<i/>}</div>
              <div className="method-node-body"><div className="method-node-head"><label><input type="checkbox" checked={methodSelected(node.id)} onChange={()=>toggleMethod(node)}/><span><small>{node.category}</small><strong>{node.name}</strong></span></label><span className="support-count">{icon('files',14)}{node.supportCount} 篇支持</span></div><p>{node.description||'请展开证据论文，复核该步骤的关键参数。'}</p>
                <div className="method-resources"><div><h3>{icon('flask-conical',15)}试剂</h3>{node.reagents.length?node.reagents.map((item,itemIndex)=>{const key=resourceKey(node,'reagent',itemIndex);return <label className="resource-row" key={key}><input type="checkbox" checked={selection.resources.includes(key)} onChange={()=>toggleResource(key)}/><span><strong>{item.name}</strong><small>{item.role||'用途见原文'} · 证据 {item.paperIds.length} 篇</small></span>{item.catalogMatch?<em>{item.catalogMatch.brand} · {money(item.catalogMatch.price)}</em>:<em className="unmatched">目录待匹配</em>}</label>}):<span className="resource-empty">原文未提取到明确试剂</span>}</div><div><h3>{icon('box',15)}材料与设备</h3>{node.materials.length?node.materials.map((item,itemIndex)=>{const key=resourceKey(node,'material',itemIndex);return <label className="resource-row" key={key}><input type="checkbox" checked={selection.resources.includes(key)} onChange={()=>toggleResource(key)}/><span><strong>{item.name}</strong><small>{item.role||'用途见原文'} · 证据 {item.paperIds.length} 篇</small></span></label>}):<span className="resource-empty">原文未提取到明确材料</span>}</div></div>
              </div>
            </article>)}</div>
            <aside className="selection-dock"><span className="eyebrow">YOUR EXPERIMENT</span><h2>已选实验路径</h2><div className="selection-number"><strong>{selection.methods.length}</strong><span>个方法节点</span></div><ul>{selectedMethods.length?selectedMethods.map(name=><li key={name}>{icon('check',13)}{name}</li>):<li className="muted">从左侧勾选要执行的方法</li>}</ul><div className="selection-totals"><span>已选目录试剂<strong>{selectedCatalogIds.length}</strong></span><span>可询价实验室<strong>{state.labProviders.filter(item=>item.status!=='paused').length}</strong></span></div><button className="btn btn-primary" disabled={!selectedCatalogIds.length} onClick={addSelectedToCart}>{icon('shopping-basket',16)}加入购物清单</button><button className="btn btn-quiet" disabled={!selectedMethods.length} onClick={()=>setModal({type:'labRequest',project,selectedMethods})}>{icon('building-2',16)}寻找实验室完成实验</button><button className="link-btn" onClick={()=>navigate('market')}>浏览全部试剂商城 →</button></aside></div>
          </section>
        </>}
      </div>;
    }
    function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[character])); }
    function Labs({state,setModal}) {
      const mapElement=useRef(null), mapRef=useRef(null), markersRef=useRef(null), requestRef=useRef(null);
      const [position,setPosition]=useState(null), [labs,setLabs]=useState([]), [radius,setRadius]=useState(10000);
      const [status,setStatus]=useState('尚未定位'), [error,setError]=useState(''), [loading,setLoading]=useState(false), [locating,setLocating]=useState(false), [selected,setSelected]=useState(null), [searched,setSearched]=useState(false), [tileError,setTileError]=useState(false);
      useEffect(()=>{const map=L.map(mapElement.current).setView([22.5431,114.0579],11);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).on('tileerror',()=>setTileError(true)).addTo(map);mapRef.current=map;const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(mapElement.current);return()=>{observer.disconnect();map.remove();requestRef.current?.abort();};},[]);
      const locate=()=>{
        if(!navigator.geolocation){setError('当前浏览器不支持定位，请使用新版手机或桌面浏览器。');return;}
        setLocating(true);setError('');setStatus('正在获取位置…');
        navigator.geolocation.getCurrentPosition(result=>{setPosition({lat:result.coords.latitude,lng:result.coords.longitude,accuracy:Math.round(result.coords.accuracy)});setLocating(false);setStatus('位置已更新');},failure=>{setLocating(false);setStatus('定位未完成');setError(failure.code===1?'位置权限未开启。请在浏览器的网站设置中允许定位，再点击重试。':failure.code===3?'定位超时，请移动到信号较好的位置后重试。':'暂时无法获取位置，请检查定位服务后重试。');},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
      };
      const search=useCallback(async()=>{
        if(!position)return;
        requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;setLoading(true);setError('');
        try{const data=await api(`/api/labs/nearby?lat=${position.lat}&lng=${position.lng}&radius=${radius}`,{signal:controller.signal});setLabs(data.labs||[]);setSearched(true);setStatus('更新于 '+new Date(data.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));}
        catch(failure){if(failure.name!=='AbortError'){setError('实验室数据暂时无法获取，请稍后重试。');setLabs([]);}}
        finally{if(!controller.signal.aborted)setLoading(false);}
      },[position,radius]);
      useEffect(()=>{search();return()=>requestRef.current?.abort();},[search]);
      useEffect(()=>{const map=mapRef.current;if(!map)return;markersRef.current?.remove();const group=L.layerGroup().addTo(map);markersRef.current=group;if(position){L.circleMarker([position.lat,position.lng],{radius:8,color:'#163a35',fillColor:'#d8f36a',fillOpacity:1}).bindPopup('你的位置，精度约 '+position.accuracy+' 米').addTo(group);const focused=labs.find(lab=>lab.id===selected);map.setView(focused?[focused.lat,focused.lng]:[position.lat,position.lng],focused?15:12);}labs.forEach(lab=>{const marker=L.circleMarker([lab.lat,lab.lng],{radius:7,color:'#2f7566',fillColor:'#ffffff',fillOpacity:1,weight:3}).bindPopup(`<strong>${escapeHtml(lab.name)}</strong><br>${escapeHtml(lab.type)} · ${lab.distanceKm} km<br>${escapeHtml(lab.address)}`).addTo(group);marker.on('click',()=>setSelected(lab.id));if(selected===lab.id)marker.openPopup();});},[labs,position,selected]);
      const focusLab=lab=>setSelected(lab.id);
      return <div className="view-shell labs-view">
        <div className="page-head"><div><div className="eyebrow">EXPERIMENT SERVICES</div><h1>寻找实验室完成实验</h1><p className="sub">按方法能力筛选入驻实验室，提交样本条件后再确认方案、档期与报价。</p></div><button className="btn btn-quiet" onClick={()=>location.hash='labAdmin'}>{icon('building-2',17)}实验室入驻</button></div>
        <section className="lab-market-section"><div className="research-section-head"><div><span>PLATFORM PROVIDERS</span><h2>平台实验服务</h2></div><p>以下为实验室自行维护或平台示例的服务范围，不展示未经确认的价格、排期或评价。</p></div><div className="lab-market-grid">{state.labProviders.filter(item=>item.status!=='paused').map(provider=><article className="panel provider-card" key={provider.id}><div className="provider-card-head"><span className={`badge ${provider.verified?'':'review'}`}>{provider.verified?'已核验':'待核验'}</span><small>{provider.city}</small></div><h3>{provider.name}</h3><div className="provider-tags">{provider.capabilities.map(value=><span key={value}>{value}</span>)}</div><dl><div><dt>交付周期</dt><dd>{provider.turnaround}</dd></div><div><dt>费用</dt><dd>{provider.pricingNote}</dd></div></dl><p>{provider.note||'具体样本要求和服务边界需与实验室确认。'}</p><button className="btn btn-primary btn-sm" onClick={()=>setModal({type:'labRequest',provider,selectedMethods:[]})}>{icon('message-square-text',14)}提交实验需求</button></article>)}</div></section>
        <section className="nearby-labs-section"><div className="research-section-head"><div><span>NEARBY RESOURCES</span><h2>附近科研资源</h2></div><button className="btn btn-primary" onClick={locate} disabled={locating}>{icon('locate-fixed',17)}{locating?'正在定位…':position?'更新我的位置':'使用我的位置'}</button></div><div className="lab-filters"><span>{icon('map-pin',16)}{status}</span><label>搜索范围<select value={radius} onChange={event=>setRadius(Number(event.target.value))}>{[5000,10000,25000,50000].map(value=><option key={value} value={value}>{value/1000} km 内</option>)}</select></label>{position&&<button className="btn btn-quiet btn-sm" disabled={loading} onClick={search}>{icon('refresh-cw',15)}刷新结果</button>}</div><div className="labs-layout"><section className="lab-map-wrapper"><div ref={mapElement} className="lab-map" aria-label="实验室地图"/>{!position&&<div className="map-placeholder"><span>{icon('navigation',16)}地图预览 · 深圳</span><p>开启定位后，将切换到你所在的位置。</p></div>}{tileError&&<div className="tile-error">底图加载缓慢，仍可通过右侧列表查看检索结果。</div>}</section><section className="panel lab-list"><div className="panel-head"><strong>附近结果</strong><span>{loading?'检索中…':labs.length+' 个'}</span></div>{error&&<div className="auth-error" role="alert">{error}<button onClick={position?search:locate}>重试</button></div>}{!labs.length&&!loading&&!error&&<div className="empty">{icon('map-pin',28)}<h3>{searched?'当前范围暂无收录':'看看你附近有什么'}</h3><p>{searched?'可以扩大搜索范围。地图未收录不代表没有实验室。':'点击“使用我的位置”，获取附近实验室和科研机构。'}</p></div>}{loading&&<div className="empty" role="status">正在检索附近实验室…</div>}{labs.map(lab=><button key={lab.id} className={`lab-card ${selected===lab.id?'active':''}`} onClick={()=>focusLab(lab)}><div className="lab-card-title"><strong>{lab.name}</strong><span>{lab.distanceKm} km</span></div><p>{lab.type}</p><p>{lab.address}</p><div className="lab-meta"><span>{lab.phone||'未收录联系电话'}</span>{icon('arrow-up-right',15)}</div></button>)}<p className="map-note">来源：OpenStreetMap。按直线距离排序，服务能力与开放时间请联系机构确认。</p></section></div><p className="map-note">点击定位后，坐标用于检索附近地点并请求地图服务，不保存为位置记录。</p></section>
      </div>;
    }
    function Metric({label,value,note}) { return h('div',{className:'panel metric'},h('div',{className:'metric-label'},label),h('div',{className:'metric-value'},value),h('div',{className:'metric-note'},note)); }
    function Market({state,addToCart,refresh,setModal,setToast}) {
      const [query,setQuery]=useState(''); const [category,setCategory]=useState('全部');
      const active=state.reagents.filter(item=>item.status!=='inactive'); const categories=['全部',...new Set(active.map(item=>item.category))];
      const items=active.filter(item=>(category==='全部'||item.category===category)&&`${item.name} ${item.brand} ${item.category} ${(item.tags||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
      const latestProject=state.researchProjects[0]; const matchedIds=[...new Set((latestProject?.methodTree||[]).flatMap(node=>node.reagents||[]).map(item=>item.catalogId).filter(Boolean))]; const planRows=matchedIds.map(id=>active.find(item=>item.id===id)).filter(Boolean).slice(0,6);
      return <div className="view-shell market-view"><section className="market-hero"><div className="market-hero-copy"><span className="market-kicker">FROM RESEARCH PLAN TO PROCUREMENT</span><h1>根据您的研究方案<br/>推荐采购</h1><p>基于论文证据、实验步骤和样本条件，为您智能匹配试剂、材料、设备与实验服务，让科研采购更高效、更准确。</p><div className="market-proof-row"><span>{icon('badge-check',18)}专业匹配<small>基于实验步骤推荐</small></span><span>{icon('truck',18)}正品保障<small>优先匹配认证供应商</small></span><span>{icon('file-check-2',18)}快速采购<small>支持询价与合同</small></span></div></div><div className="plan-board"><div className="plan-board-head"><div><span>当前研究方案</span><strong>{latestProject?.topic||'尚未创建研究方案'}</strong><small>已识别 {planRows.length} 项采购需求</small></div><button className="text-link" onClick={()=>location.hash='research'}>切换研究方案 {icon('arrow-up-right',14)}</button></div><div className="plan-table-head"><span>#</span><span>采购项目</span><span>类别</span><span>推荐商品示例</span><span>数量</span><span>操作</span></div>{!planRows.length&&<div className="empty">当前方案暂无已匹配商品，请在方法树选择试剂或浏览商城。</div>}{planRows.map((item,index)=><div className="plan-table-row" key={item.id}><b>{index+1}</b><strong>{item.name}</strong><span className={`market-tag ${index%2?'blue':'green'}`}>{item.category}</span><span>{item.brand} · {item.spec}</span><span>1</span><button onClick={()=>addToCart(item.id,1)}>查看推荐</button></div>)}<div className="plan-board-actions"><button className="btn btn-quiet" onClick={()=>location.hash='research'}>{icon('file-text',16)}查看完整采购方案</button><button className="btn btn-primary" disabled={!planRows.length} onClick={()=>planRows.forEach(item=>addToCart(item.id,1))}>{icon('shopping-cart',16)}一键加入采购清单</button></div></div></section><section className="market-section"><div className="market-section-head"><div><h2>按业务类型浏览</h2><p>丰富的科研产品与服务，满足不同研究需求</p></div><button className="text-link" onClick={()=>setCategory('全部')}>查看全部分类 {icon('arrow-up-right',14)}</button></div><div className="market-category-grid">{[['试剂','生化试剂 · 分子生物学 · 细胞培养','flask-conical','green'],['材料','金属材料 · 高分子材料 · 纳米材料','box','blue'],['设备','传感器 · 分析仪器 · 实验设备','microscope','sage'],['实验服务','检测分析 · 材料表征 · 测序实验','building-2','sand'],['其它','软件与数据库 · 科研工具 · 技术服务','layout-grid','lavender']].map(([label,description,iconName,tone])=><button key={label} className={`market-category-card ${tone}`} onClick={()=>setCategory(label==='试剂'?'RNA 提取':label)}>{icon(iconName,28)}<strong>{label}</strong><span>{description}</span>{icon('arrow-up-right',17)}</button>)}</div></section><section className="market-search-section"><div><h2>试剂专业搜索</h2><p>支持试剂名称、CAS 号、货号、品牌等多种方式检索</p></div><div className="market-search-row"><div className="search market-search">{icon('search')}<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="请输入试剂名称 / CAS号 / 货号 / 品牌 …"/><button onClick={()=>{}} aria-label="搜索">{icon('search',18)}</button></div><div className="quick-searches"><span>快速查询</span><button onClick={()=>setQuery('CAS')}>CAS号查询</button><button onClick={()=>setQuery('RNA')}>货号查询</button><button onClick={()=>setQuery('QIAGEN')}>按品牌查找</button><button onClick={()=>setCategory('全部')}>高级搜索</button></div></div></section><section className="market-products"><div className="market-section-head"><div><h2>热门商品推荐</h2><p>从方案证据出发，优先展示适合当前课题的商品</p></div><button className="text-link" onClick={()=>setCategory('全部')}>查看全部商品 {icon('arrow-up-right',14)}</button></div><div className="market-tabs">{['试剂','材料','设备','实验服务'].map(label=><button key={label} className={label==='试剂'?'active':''}>{label}</button>)}</div><div className="reagent-grid">{items.map(item=><ReagentCard key={item.id} item={item} addToCart={addToCart}/>)}{!items.length&&<div className="empty">没有找到匹配试剂。</div>}</div></section><section className="market-trust-row"><span>{icon('shield-check',24)}<strong>正品保障<small>严选精选优质供应商</small></strong></span><span>{icon('truck',24)}<strong>快速配送<small>多仓发货，安全可靠</small></strong></span><span>{icon('file-signature',24)}<strong>发票与合同<small>支持增值税发票、科研合同</small></strong></span><span>{icon('headphones',24)}<strong>专业客服<small>科研采购咨询与技术支持</small></strong></span></section></div>;
    }
    function ReagentCard({item,addToCart}) { return h('article',{className:'panel reagent-card'},h('div',{className:'reagent-header'},h('div',{className:'reagent-swatch',style:{background:item.color}},icon('flask-conical',19)),h('span',{className:'badge'},item.category)),h('div',{className:'reagent-brand'},item.brand),h('div',{className:'reagent-name'},item.name),h('p',null,`${item.spec} · ${item.seller} · ★ ${item.rating}`),h('div',{className:'reagent-foot'},h('div',null,h('div',{className:'price'},money(item.price)),h('div',{className:`stock ${item.stock<10?'low':''}`},item.stock<10?'库存偏低':'有现货 · '+item.stock+' 件')),h('button',{className:'btn btn-primary btn-sm',onClick:()=>addToCart(item.id)},icon('plus',13),'加入清单'))); }

    function MarketAdmin({state,navigate,refresh,setToast}) {
      const [query,setQuery]=useState(''); const [drafts,setDrafts]=useState({}); const [syncing,setSyncing]=useState(false);
      const products=state.reagents.filter(item=>`${item.name} ${item.brand} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
      const draftFor=item=>drafts[item.id]||{price:item.price,stock:item.stock,status:item.status||'active'};
      const change=(item,key,value)=>setDrafts(current=>({...current,[item.id]:{...draftFor(item),[key]:value}}));
      const save=async item=>{try{await api('/api/reagents/'+item.id,{method:'PATCH',body:JSON.stringify(draftFor(item))});await refresh();setDrafts(current=>{const next={...current};delete next[item.id];return next;});setToast('商品已更新');}catch(error){setToast(error.message);}};
      const sync=async()=>{setSyncing(true);try{const data=await api('/api/merchant/ruijing/sync',{method:'POST'});setToast(data.connected?'供应商目录已同步':'已刷新样例供应商目录');}catch(error){setToast(error.message);}finally{setSyncing(false);}};
      const active=state.reagents.filter(item=>item.status!=='inactive'); const low=active.filter(item=>item.stock<10);
      return <div className="admin-view"><div className="admin-page-head"><div><span className="admin-kicker">CATALOG / FULFILLMENT</span><h2>商城总览</h2><p>把供应商目录、商品库存和订单状态放在同一个运营台里，用户端只读取已发布商品。</p></div><div className="admin-actions"><button className="btn btn-quiet" onClick={sync} disabled={syncing}>{icon('refresh-cw',15)}{syncing?'同步中…':'同步供应商目录'}</button><button className="btn btn-primary" onClick={()=>navigate('merchant')}>{icon('package-plus',15)}进入商家工作台</button></div></div><div className="admin-metrics"><div><span>已上架商品</span><strong>{active.length}</strong><small>全平台可购买</small></div><div><span>库存预警</span><strong className={low.length?'warning':''}>{low.length}</strong><small>库存低于 10 件</small></div><div><span>待确认订单</span><strong>{state.orders.filter(item=>item.status==='待商家确认').length}</strong><small>需要履约跟进</small></div><div><span>购物清单商品</span><strong>{state.cart.reduce((sum,item)=>sum+item.quantity,0)}</strong><small>当前用户工作区</small></div></div><section className="admin-panel"><div className="admin-panel-head"><div><h3>商品目录</h3><span>用户端展示内容的唯一运营来源</span></div><div className="admin-search">{icon('search',15)}<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索商品、品牌或分类"/></div></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>商品</th><th>分类 / 规格</th><th>价格</th><th>库存</th><th>发布状态</th><th>更新</th></tr></thead><tbody>{products.map(item=>{const draft=draftFor(item);return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.brand} · {item.seller}</small></td><td>{item.category}<small>{item.spec}</small></td><td><input type="number" min="0" value={draft.price} onChange={event=>change(item,'price',event.target.value)} aria-label={`${item.name}价格`}/></td><td><input type="number" min="0" value={draft.stock} onChange={event=>change(item,'stock',event.target.value)} aria-label={`${item.name}库存`}/></td><td><select value={draft.status} onChange={event=>change(item,'status',event.target.value)} aria-label={`${item.name}发布状态`}><option value="active">已发布</option><option value="inactive">已下架</option></select></td><td><button className="btn btn-primary btn-sm" onClick={()=>save(item)}>保存</button></td></tr>})}</tbody></table>{!products.length&&<div className="empty">没有匹配商品。</div>}</div></section><div className="admin-lower-grid"><section className="admin-panel"><div className="admin-panel-head"><div><h3>订单履约</h3><span>最近订单和付款状态</span></div><button className="text-link" onClick={()=>navigate('orders')}>查看全部 {icon('arrow-up-right',14)}</button></div>{state.orders.slice(0,4).map(order=><div className="admin-list-row" key={order.id}><span className="admin-list-icon">{icon('package',17)}</span><div><strong>{order.id}</strong><small>{order.seller} · {order.itemCount} 件</small></div><span className="admin-status-pill">{order.status}</span><b>{money(order.total)}</b></div>)}</section><section className="admin-panel"><div className="admin-panel-head"><div><h3>供给来源</h3><span>商城当前接入的目录</span></div></div><div className="source-block"><div><span className="source-mark">锐</span><strong>锐竞供应商目录</strong><small>SKU、规格、库存与价格</small></div><span className="admin-status-pill success">已连接样例</span></div><div className="source-block"><div><span className="source-mark pale">P</span><strong>PaperPilot 自营商品</strong><small>平台维护的研究耗材</small></div><span className="admin-status-pill">{active.length} 个</span></div></section></div></div>;
    }

    function ModelAdmin({state,refresh,setToast}) {
      const [models,setModels]=useState(state.models||[]); const [saving,setSaving]=useState('');
      useEffect(()=>{setModels(state.models||[])},[state.models]);
      const load=async()=>{try{const data=await api('/api/admin/models');setModels(data.models||[]);}catch(error){setToast(error.message);}};
      useEffect(()=>{load();},[]);
      const update=async(model,status)=>{setSaving(model.id);try{const data=await api('/api/admin/models/'+model.id,{method:'PATCH',body:JSON.stringify({status})});setModels(current=>current.map(item=>item.id===model.id?data.model:item));setToast('模型状态已更新');}catch(error){setToast(error.message);}finally{setSaving('');}};
      const active=models.filter(model=>model.status==='active').length; const avg=models.length?Math.round(models.reduce((sum,item)=>sum+Number(item.quality||0),0)/models.length):0;
      return <div className="admin-view"><div className="admin-page-head"><div><span className="admin-kicker">REGISTRY / EVALUATION</span><h2>模型管理</h2><p>独立维护模型版本、流量状态和质量指标，避免模型配置与商城运营互相污染。</p></div><div className="admin-actions"><button className="btn btn-quiet" onClick={load}>{icon('refresh-cw',15)}刷新注册表</button><button className="btn btn-primary" onClick={()=>setToast('模型接入申请已记录，等待审核')}>{icon('plus',15)}登记新模型</button></div></div><div className="admin-metrics model-metrics"><div><span>注册模型</span><strong>{models.length}</strong><small>版本与路由均有记录</small></div><div><span>在线模型</span><strong>{active}</strong><small>可接收生产流量</small></div><div><span>平均质量分</span><strong>{avg}<em>/100</em></strong><small>最近一次评测结果</small></div><div><span>今日调用量</span><strong>{models.reduce((sum,item)=>sum+Number(item.calls||0),0).toLocaleString('zh-CN')}</strong><small>来自研究工作台</small></div></div><section className="admin-panel"><div className="admin-panel-head"><div><h3>模型注册表</h3><span>版本、用途、流量与最后评测</span></div><span className="admin-status"><i/>自动记录</span></div><div className="model-list">{models.map(model=><article className="model-row" key={model.id}><div className="model-icon">{icon(model.type==='retrieval'?'scan-search':'brain-circuit',20)}</div><div className="model-main"><div><strong>{model.name}</strong><span className="model-version">{model.version}</span></div><p>{model.description}</p><div className="model-meta"><span>用途：{model.useCase}</span><span>负责人：{model.owner}</span><span>最近评测：{model.evaluatedAt}</span></div></div><div className="model-score"><strong>{model.quality}</strong><span>质量分</span></div><div className="model-traffic"><span>流量 {model.traffic}%</span><div><i style={{width:`${model.traffic}%`}}/></div></div><div className="model-actions"><span className={`model-status ${model.status}`}>{model.status==='active'?'在线':model.status==='paused'?'暂停':'灰度'}</span><button className="icon-btn" title={model.status==='active'?'暂停模型':'上线模型'} aria-label={model.status==='active'?'暂停模型':'上线模型'} disabled={saving===model.id} onClick={()=>update(model,model.status==='active'?'paused':'active')}>{icon(model.status==='active'?'pause':'play',16)}</button></div></article>)}</div></section><div className="admin-lower-grid"><section className="admin-panel"><div className="admin-panel-head"><div><h3>评测集</h3><span>模型发布前必须通过的检查</span></div></div>{[['科研问答事实性','1,248 条样本','通过率 94.8%'],['Methods 结构化','620 条样本','通过率 91.2%'],['采购匹配召回','410 条样本','通过率 88.6%']].map(([label,count,rate])=><div className="eval-row" key={label}><div><strong>{label}</strong><small>{count}</small></div><span>{rate}</span></div>)}</section><section className="admin-panel"><div className="admin-panel-head"><div><h3>路由策略</h3><span>当前生产请求的分配逻辑</span></div></div><div className="route-row"><span>研究问题</span><strong>DeepSeek Chat</strong><em>主路由</em></div><div className="route-row"><span>文献检索</span><strong>Europe PMC + PubMed</strong><em>证据源</em></div><div className="route-row"><span>方法解析</span><strong>Methods Agent v2</strong><em>主路由</em></div></section></div></div>;
    }

    function Merchant({state,user,refresh,setToast,setModal}) {
      const [catalog, setCatalog] = useState([]);
      const [connected, setConnected] = useState(false);
      const [source, setSource] = useState('');
      const [selected, setSelected] = useState([]);
      const [syncing, setSyncing] = useState(false);
      const [productQuery,setProductQuery]=useState('');
      const [drafts,setDrafts]=useState({});
      const [shippingDrafts,setShippingDrafts]=useState({});
      const [shippingBusy,setShippingBusy]=useState('');

      const load = async () => {
        try {
          const data = await api('/api/merchant/ruijing/catalog');
          setCatalog(data.catalog || []);
          setConnected(Boolean(data.connected));
          setSource(data.source || '');
        } catch (error) {
          setToast(error.message);
        }
      };

      useEffect(() => { load(); }, []);

      const sync = async () => {
        setSyncing(true);
        try {
          const data = await api('/api/merchant/ruijing/sync', { method: 'POST' });
          setCatalog(data.catalog || []);
          setConnected(Boolean(data.connected));
          setSource(data.source || '');
          setSelected([]);
          setToast(data.connected ? '锐竞 SKU 已同步' : '已载入锐竞目录样例；配置 RUIJING_SKU_URL 后可切换真实 API');
        } catch (error) {
          setToast(error.message);
        } finally {
          setSyncing(false);
        }
      };

      const toggle = sku => setSelected(current => current.includes(sku)
        ? current.filter(item => item !== sku)
        : [...current, sku]);

      const importSelected = async (skus = selected) => {
        if (!skus.length) return;
        try {
          const data = await api('/api/merchant/ruijing/import', {
            method: 'POST',
            body: JSON.stringify({ skus })
          });
          await refresh();
          setSelected([]);
          setToast(`已将 ${data.imported.length} 个 SKU 上架到商城`);
        } catch (error) {
          setToast(error.message);
        }
      };

      const imported = sku => state.reagents.some(item => item.sku === sku);
      const available = catalog.filter(item => !imported(item.sku));
      const products=state.reagents.filter(item=>item.ownerUserId===user.id&&`${item.name} ${item.brand} ${item.category}`.toLowerCase().includes(productQuery.toLowerCase()));
      const draftFor=item=>drafts[item.id]||{price:item.price,stock:item.stock,status:item.status||'active'};
      const changeProduct=(item,key,value)=>setDrafts(current=>({...current,[item.id]:{...draftFor(item),[key]:value}}));
      const saveProduct=async item=>{try{await api('/api/reagents/'+item.id,{method:'PATCH',body:JSON.stringify(draftFor(item))});await refresh();setDrafts(current=>{const next={...current};delete next[item.id];return next;});setToast('商品信息已更新');}catch(error){setToast(error.message);}};
      const deleteProduct=async item=>{if(!window.confirm(`确认删除“${item.name}”？`))return;try{await api('/api/reagents/'+item.id,{method:'DELETE'});await refresh();setToast('商品已删除');}catch(error){setToast(error.message);}};
      const ship=async order=>{const draft=shippingDrafts[order.id]||{};setShippingBusy(order.id);try{await api(`/api/merchant/orders/${order.id}/ship`,{method:'PATCH',body:JSON.stringify(draft)});await refresh();setToast('已录入物流，买家可在订单查看运单号');}catch(error){setToast(error.message);}finally{setShippingBusy('');}};

      return (
        <div className="view-shell">
          <div className="page-head">
            <div>
              <div className="eyebrow">MERCHANT / SKU SOURCING</div>
              <h1>商家端</h1>
              <p className="sub">维护自己的试剂商品，确认已付款订单并录入物流信息。</p>
            </div>
            <div className="toolbar">
              <button className="btn btn-primary" onClick={()=>setModal({type:'sell'})}>{icon('plus',15)}发布试剂</button>
              <button className="btn btn-quiet" onClick={sync} disabled={syncing}>
                {icon('refresh-cw', 15)}{syncing ? '同步中…' : '同步锐竞 SKU'}
              </button>
              <button className="btn btn-accent" onClick={() => importSelected()} disabled={!selected.length}>
                {icon('package-plus', 15)}导入已选 {selected.length} 个
              </button>
            </div>
          </div>

          <div className="section-grid">
            <Metric label="锐竞目录" value={catalog.length} note={source || '等待同步'} />
            <Metric label="已上架 SKU" value={catalog.filter(item => imported(item.sku)).length} note="已进入 PaperPilot 商城" />
            <Metric label="内容推荐可用" value={state.reagents.length} note="智能体可拉取推荐" />
          </div>

          <div className="connector-bar">
            <div>
              <strong>{connected ? '锐竞 API 已连接' : '锐竞 API 待配置'}</strong>
              <p>{connected ? '同步后可持续拉取最新价格、库存与规格。' : '当前为云端样例目录，可在服务端配置 RUIJING_SKU_URL 接入真实 SKU 接口。'}</p>
            </div>
            <span className={`badge ${connected ? '' : 'review'}`}>{connected ? 'LIVE' : 'SAMPLE'}</span>
          </div>

          <section className="panel merchant-fulfillment">
            <div className="panel-head"><div><div className="panel-title">订单履约与发货</div><div className="source-label">只显示您上架商品对应的订单；微信确认收款后才能发货</div></div></div>
            {state.merchantOrders.length ? state.merchantOrders.map(order=>{const group=order.fulfillments[0],draft=shippingDrafts[order.id]||{};return <article className="merchant-shipment" key={order.id}><div className="merchant-shipment-head"><strong>{order.id}</strong><span className="status-badge">{order.paymentStatus==='paid'?group.status:'待付款'}</span></div><p>{group.items.map(item=>`${item.name} × ${item.quantity}`).join('、')}</p><p>收件：{order.shipping?.recipient||'未填写'} · {order.shipping?.phone||'—'} · {order.shipping?.address||'—'}</p>{group.status==='已发货'?<p>物流：{group.carrier} · {group.trackingNo}</p>:<div className="merchant-ship-form"><input aria-label={`${order.id}物流公司`} placeholder="物流公司" maxLength={80} value={draft.carrier||''} onChange={event=>setShippingDrafts(current=>({...current,[order.id]:{...draft,carrier:event.target.value}}))}/><input aria-label={`${order.id}运单号`} placeholder="运单号" maxLength={80} value={draft.trackingNo||''} onChange={event=>setShippingDrafts(current=>({...current,[order.id]:{...draft,trackingNo:event.target.value}}))}/><button className="btn btn-primary btn-sm" disabled={shippingBusy===order.id||order.paymentStatus!=='paid'||!draft.carrier?.trim()||!draft.trackingNo?.trim()} onClick={()=>ship(order)}>{shippingBusy===order.id?'提交中…':'确认发货'}</button></div>}</article>;}):<div className="empty">暂无您店铺的订单。发布商品后，已付款订单会显示在这里。</div>}
          </section>

          <section className="panel merchant-products">
            <div className="panel-head"><div><div className="panel-title">店铺商品管理</div><div className="source-label" style={{marginTop:'4px'}}>维护价格、库存与上下架状态</div></div><div className="search compact">{icon('search',15)}<input value={productQuery} onChange={event=>setProductQuery(event.target.value)} placeholder="搜索商品"/></div></div>
            <div className="table-scroll"><table className="sku-table product-admin-table"><thead><tr><th>商品</th><th>分类 / 规格</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr></thead><tbody>{products.map(item=>{const draft=draftFor(item);return <tr key={item.id}><td><strong>{item.name}</strong><div className="source-label">{item.brand} · {item.seller}</div></td><td>{item.category}<div className="source-label">{item.spec}</div></td><td><input aria-label={`${item.name}价格`} type="number" min="0" value={draft.price} onChange={event=>changeProduct(item,'price',event.target.value)}/></td><td><input aria-label={`${item.name}库存`} type="number" min="0" value={draft.stock} onChange={event=>changeProduct(item,'stock',event.target.value)}/></td><td><select aria-label={`${item.name}状态`} value={draft.status} onChange={event=>changeProduct(item,'status',event.target.value)}><option value="active">已上架</option><option value="inactive">已下架</option></select></td><td><div className="row-actions"><button className="btn btn-primary btn-sm" onClick={()=>saveProduct(item)}>保存</button><button className="icon-btn" aria-label={`删除${item.name}`} onClick={()=>deleteProduct(item)}>{icon('trash-2',15)}</button></div></td></tr>})}</tbody></table>{!products.length&&<div className="empty">没有匹配商品。</div>}</div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">锐竞 SKU 目录</div>
                <div className="source-label" style={{ marginTop: '4px' }}>先选择 SKU，再导入到商城；已上架商品会被智能体纳入推荐</div>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={() => setSelected(available.map(item => item.sku))} disabled={!available.length}>
                {icon('check-check', 13)}全选未上架
              </button>
            </div>

            <div className="table-scroll">
              <table className="sku-table">
                <thead>
                  <tr><th></th><th>SKU</th><th>试剂</th><th>品牌 / 规格</th><th>价格</th><th>库存</th><th>状态</th></tr>
                </thead>
                <tbody>
                  {catalog.map(item => (
                    <tr key={item.sku}>
                      <td><input type="checkbox" checked={selected.includes(item.sku)} disabled={imported(item.sku)} onChange={() => toggle(item.sku)} /></td>
                      <td><span className="sku-code">{item.sku}</span></td>
                      <td><strong>{item.name}</strong><div className="source-label">{item.category}</div></td>
                      <td>{item.brand} · {item.spec}</td>
                      <td><strong>{money(item.price)}</strong></td>
                      <td>{item.stock}</td>
                      <td>{imported(item.sku) ? <span className="sku-imported">已上架</span> : <button className="btn btn-quiet btn-sm" onClick={() => importSelected([item.sku])}>{icon('package-plus', 13)}上架</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!catalog.length && <div className="empty">暂无锐竞 SKU，请先点击“同步锐竞 SKU”。</div>}
            </div>
          </section>
        </div>
      );
    }

    function LabAdmin({state,refresh,setToast}) {
      const [form,setForm]=useState({name:'',city:'',capabilities:'',serviceCategories:'',turnaround:'',pricingNote:'',contact:'',note:''});
      const [saving,setSaving]=useState(false);
      const owned=state.labProviders.filter(item=>item.ownerUserId===state.user?.id);
      const change=event=>setForm(current=>({...current,[event.target.name]:event.target.value}));
      const submit=async event=>{event.preventDefault();setSaving(true);try{await api('/api/lab/providers',{method:'POST',body:JSON.stringify(form)});await refresh();setForm({name:'',city:'',capabilities:'',serviceCategories:'',turnaround:'',pricingNote:'',contact:'',note:''});setToast('入驻资料已提交审核');}catch(error){setToast(error.message);}finally{setSaving(false);}};
      const updateProvider=async(provider,patch)=>{try{await api('/api/lab/providers/'+provider.id,{method:'PATCH',body:JSON.stringify(patch)});await refresh();setToast('实验室服务状态已更新');}catch(error){setToast(error.message);}};
      const updateRequest=async(request,status)=>{try{await api('/api/lab/requests/'+request.id,{method:'PATCH',body:JSON.stringify({status})});await refresh();setToast('委托状态已更新');}catch(error){setToast(error.message);}};
      return <div className="view-shell provider-admin"><div className="page-head"><div><div className="eyebrow">LAB PROVIDER CONSOLE</div><h1>实验室管理后台</h1><p className="sub">提交服务能力、管理展示状态，并处理平台转来的实验需求。</p></div></div>
        <div className="provider-admin-grid"><form className="panel provider-form" onSubmit={submit}><div className="panel-head"><div><div className="panel-title">实验室入驻</div><div className="source-label">首次提交后进入平台审核</div></div><span className="badge review">申请</span></div><div className="form-grid"><div className="field full"><label>实验室名称 *</label><input name="name" value={form.name} onChange={change} required/></div><div className="field"><label>所在城市 *</label><input name="city" value={form.city} onChange={change} required/></div><div className="field"><label>服务分类</label><input name="serviceCategories" value={form.serviceCategories} onChange={change} placeholder="单细胞测序，分子生物学"/></div><div className="field full"><label>实验能力</label><input name="capabilities" value={form.capabilities} onChange={change} placeholder="组织解离，流式分选，建库测序"/></div><div className="field"><label>周期说明</label><input name="turnaround" value={form.turnaround} onChange={change} placeholder="收到合格样本后评估"/></div><div className="field"><label>费用说明</label><input name="pricingNote" value={form.pricingNote} onChange={change} placeholder="按项目询价"/></div><div className="field full"><label>联系信息</label><input name="contact" value={form.contact} onChange={change}/></div><div className="field full"><label>服务边界与样本要求</label><textarea name="note" value={form.note} onChange={change} rows={4}/></div></div><button className="btn btn-primary" disabled={saving}>{saving?'正在提交…':'提交入驻资料'}</button></form>
          <div className="provider-admin-list"><section className="panel"><div className="panel-head"><div><div className="panel-title">我的实验室</div><div className="source-label">{owned.length} 个入驻主体</div></div></div>{owned.length?owned.map(provider=><div className="admin-provider-row" key={provider.id}><div><strong>{provider.name}</strong><span>{provider.city} · {provider.capabilities.join(' / ')||'待补充能力'}</span></div><select value={provider.status} onChange={event=>updateProvider(provider,{status:event.target.value})}><option value="review">审核中</option><option value="active">接收需求</option><option value="paused">暂停接单</option></select></div>):<div className="empty">还没有入驻记录，请先提交左侧资料。</div>}</section>
          <section className="panel lab-request-admin"><div className="panel-head"><div><div className="panel-title">实验委托</div><div className="source-label">用户从 Methods 树提交的需求</div></div><span>{state.labRequests.length} 条</span></div>{state.labRequests.length?state.labRequests.map(request=><article key={request.id}><div><strong>{request.selectedMethods.join('、')}</strong><span>{request.labName} · {new Date(request.createdAt).toLocaleString('zh-CN',{hour12:false})}</span><p>{request.sampleInfo||'用户暂未填写样本说明'}</p></div><select value={request.status} onChange={event=>updateRequest(request,event.target.value)}>{['待实验室评估','已接洽','方案确认中','执行中','已完成','已关闭'].map(value=><option key={value}>{value}</option>)}</select></article>):<div className="empty">收到的实验委托会显示在这里。</div>}</section></div>
        </div>
      </div>;
    }

    function Orders({state,navigate,setModal,setToast}) {
      const [filter,setFilter]=useState('全部');
      const orders=state.orders.filter(order=>filter==='全部'||(filter==='待支付'?order.paymentStatus==='pending':order.paymentStatus!=='pending'));
      const exportOrders=()=>{const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'").replaceAll('"','""')+'"';const rows=[['订单号','供应商','商品数','金额','下单时间','状态'],...orders.map(order=>[order.id,order.seller,order.itemCount,order.total,order.createdAt,order.status])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='PaperPilot-购买记录.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
      return <div className="view-shell"><div className="page-head"><div><h1>购买记录</h1><p className="sub">订单付款由微信确认，商家发货后可查看物流。</p></div><button className="btn btn-quiet" disabled={!orders.length} onClick={exportOrders}>{icon('download',16)}导出记录</button></div><div className="filter-tabs">{['全部','待支付','其他订单'].map(value=><button className={filter===value?'active':''} key={value} onClick={()=>setFilter(value)}>{value}</button>)}</div><section className="panel order-list">{!orders.length?<div className="empty">{icon('receipt-text',30)}<h3>暂无{filter==='全部'?'':filter}订单</h3><p>采购记录会在这里留档。</p><button className="btn btn-primary" onClick={()=>navigate('market')}>去商城看看</button></div>:orders.map(order=><article className="order-row" key={order.id}><div className="order-row-icon">{icon('package',23)}</div><div className="order-row-body"><strong>{order.seller}</strong><p>{order.id} · {new Date(order.createdAt).toLocaleString('zh-CN',{hour12:false})}</p><span>{order.items?.map(item=>`${item.name||item.reagentId} × ${item.quantity}`).join('、')||`${order.itemCount} 件商品`}</span>{order.fulfillments?.filter(group=>group.status==='已发货').map(group=><p key={group.merchantId}>已发货：{group.carrier} · {group.trackingNo}</p>)}{order.paymentStatus==='pending'&&order.payment?.qrUrl&&<button className="btn btn-quiet btn-sm" onClick={()=>setModal({type:'payment',order})}>继续扫码 / 核对支付</button>}</div><div className="order-row-status"><strong>{money(order.total)}</strong><span className="status-badge">{order.status}</span></div></article>)}</section></div>;
    }

    function Insights({navigate}) { return h('div',{className:'view-shell'},h('div',{className:'page-head'},h('div',null,h('div',{className:'eyebrow'},'PRODUCT STRATEGY / 2026'),h('h1',null,'竞品洞察'),h('p',{className:'sub'},'先看市场缺口，再决定 PaperPilot 的下一步。')),h('button',{className:'btn btn-primary',onClick:()=>navigate('research')},icon('arrow-left'),'回到研究方案')),h('div',{className:'insight-grid'},h('article',{className:'panel insight-card featured'},h('div',{className:'eyebrow'},'OUR WEDGE'),h('h2',null,'不是又一个 AI 搜索框。'),h('p',null,'PaperPilot 把 paper 的证据链直接接到试剂采购：用户不需要在文献、品牌官网和采购群之间来回搬运信息。'),h('div',{className:'signal',style:{marginTop:'20px',background:'#263c3e',borderColor:'#3a5552',color:'#d8f36a'}},'痛点：知道“用什么”，却不知道“买哪个、是否有货、为什么匹配”。')),h('article',{className:'panel insight-card'},h('div',{className:'eyebrow'},'COMPETITOR MAP'),h('h2',null,'四类产品，各自断在一处'),h('div',{className:'gap-line'},h('span',null,'PubMed / Google Scholar'),h('strong',null,'能找，不能执行')),h('div',{className:'gap-line'},h('span',null,'protocol.io / Benchling'),h('strong',null,'能复现，采购断裂')),h('div',{className:'gap-line'},h('span',null,'赛默飞 / 阿拉丁商城'),h('strong',null,'能买，不懂上下文')),h('div',{className:'gap-line'},h('span',null,'通用 AI 助手'),h('strong',null,'会答，难追溯'))),h('article',{className:'panel insight-card'},h('div',{className:'eyebrow'},'USER PAIN / PRIORITY'),h('h2',null,'首版只做高频闭环'),h('div',{className:'method-list'},[['01','检索可信','按研究对象和方法找 paper，并保留出处'],['02','结构化解析','试剂、浓度、货号和方法参数分层呈现'],['03','可信交易','规格、库存、供应商、订单与二维码闭环']].map(item=>h('div',{className:'method',key:item[0]},h('div',{className:'method-num'},item[0]),h('div',null,h('strong',null,item[1]),h('span',null,item[2]))))))) ,h('section',{className:'panel',style:{marginTop:'14px',padding:'20px'}},h('div',{className:'eyebrow'},'DEFENSIBILITY'),h('h2',null,'让数据越用越有价值'),h('div',{className:'insight-grid',style:{marginTop:'17px'}},[['论文—试剂—结果图谱','每次解析与采购都沉淀为可追溯关系。'],['实验室采购偏好','按实验类型积累规格、品牌与替代选择。'],['商家供给质量','库存兑现率与复购反馈反哺排序。']].map(item=>h('div',{key:item[0]},h('h3',null,item[0]),h('p',{className:'sub'},item[1])))))); }

    function ModalRouter({modal,state,setModal,refresh,setToast}) { if(modal.type==='cart')return h(CartModal,{state,setModal,refresh,setToast}); if(modal.type==='sell')return h(SellModal,{setModal,refresh,setToast}); if(modal.type==='checkout')return h(CheckoutModalNative,{state,setModal,refresh,setToast}); if(modal.type==='payment')return h(PaymentModal,{order:modal.order,setModal,refresh,setToast}); if(modal.type==='labRequest')return h(LabRequestModal,{modal,state,setModal,refresh,setToast}); return h(HelpModal,{setModal}); }
    function Modal({title,children,actions,setModal}) {
      const dialogRef=useRef(null);
      useEffect(()=>{const previous=document.activeElement;const dialog=dialogRef.current;const focusable=()=>Array.from(dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea,select,[tabindex="0"]')).filter(element=>element.getClientRects().length);(focusable()[1]||focusable()[0])?.focus();const keydown=event=>{if(event.key==='Escape')setModal(null);if(event.key==='Tab'){const elements=focusable(),first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};dialog.addEventListener('keydown',keydown);return()=>{dialog.removeEventListener('keydown',keydown);previous?.focus();};},[]);
      return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setModal(null)}><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-btn" aria-label="关闭窗口" onClick={()=>setModal(null)}>{icon('x',19)}</button></div><div className="modal-body">{children}</div>{actions&&<div className="modal-actions">{actions}</div>}</section></div>;
    }
    function CartModal({state,setModal,refresh,setToast}) {
      const [busy,setBusy]=useState(false);
      const lines=state.cart.map(line=>({...line,item:state.reagents.find(item=>item.id===line.reagentId)})).filter(line=>line.item);
      const total=lines.reduce((sum,line)=>sum+line.item.price*line.quantity,0);
      const update=async(line,quantity)=>{setBusy(true);try{await api('/api/cart/'+line.item.id,{method:quantity===0?'DELETE':'PATCH',body:quantity?JSON.stringify({quantity}):undefined});await refresh();}catch(error){setToast(error.message);}finally{setBusy(false);}};
      return <Modal title="购物清单" setModal={setModal} actions={lines.length?<div className="cart-checkout"><div><span>合计</span><strong>{money(total)}</strong></div><button className="btn btn-primary" disabled={busy} onClick={()=>setModal({type:'checkout'})}>去结算{icon('arrow-right',17)}</button></div>:null}>{lines.length?lines.map(line=><div className="cart-row" key={line.item.id}><div className="product-dot" style={{background:line.item.color}}>{icon('flask-conical',18)}</div><div className="cart-item"><strong>{line.item.name}</strong><p>{line.item.spec} · {line.item.seller}</p><div className="cart-item-bottom"><span className="price">{money(line.item.price*line.quantity)}</span><div className="quantity-stepper"><button disabled={busy||line.quantity<=1} aria-label={'减少 '+line.item.name} onClick={()=>update(line,line.quantity-1)}>{icon('minus',14)}</button><span>{line.quantity}</span><button disabled={busy||line.quantity>=line.item.stock} aria-label={'增加 '+line.item.name} onClick={()=>update(line,line.quantity+1)}>{icon('plus',14)}</button></div></div></div><button className="icon-btn" disabled={busy} aria-label={'移除 '+line.item.name} onClick={()=>update(line,0)}>{icon('trash-2',16)}</button></div>):<div className="empty">{icon('shopping-basket',32)}<h3>购物清单还是空的</h3><p>从试剂商城选择商品后，可在这里核对规格与数量。</p><button className="btn btn-quiet" onClick={()=>setModal(null)}>继续探索</button></div>}</Modal>;
    }
    function SellModal({setModal,refresh,setToast}) { const [form,setForm]=useState({name:'',brand:'',category:'',spec:'',price:'',stock:'',seller:'我的店铺'}); const change=e=>setForm({...form,[e.target.name]:e.target.value}); const submit=async()=>{try{await api('/api/reagents',{method:'POST',body:JSON.stringify(form)});setModal(null);refresh();setToast('试剂已发布到商城')}catch(e){setToast(e.message)}}; return h(Modal,{title:'发布试剂',setModal,actions:h('button',{className:'btn btn-primary',onClick:submit},icon('upload',15),'发布到商城')},h('div',{className:'form-grid'},h('div',{className:'field full'},h('label',null,'试剂名称 *'),h('input',{name:'name',value:form.name,onChange:change,placeholder:'例如：RNeasy Plus Mini Kit'})),h('div',{className:'field'},h('label',null,'品牌'),h('input',{name:'brand',value:form.brand,onChange:change,placeholder:'QIAGEN'})),h('div',{className:'field'},h('label',null,'分类'),h('input',{name:'category',value:form.category,onChange:change,placeholder:'RNA 提取'})),h('div',{className:'field'},h('label',null,'包装规格'),h('input',{name:'spec',value:form.spec,onChange:change,placeholder:'50 preps'})),h('div',{className:'field'},h('label',null,'价格（元） *'),h('input',{name:'price',type:'number',value:form.price,onChange:change,placeholder:'1280'})),h('div',{className:'field'},h('label',null,'现货数量'),h('input',{name:'stock',type:'number',value:form.stock,onChange:change,placeholder:'20'})),h('div',{className:'field full'},h('label',null,'商家名称'),h('input',{name:'seller',value:form.seller,onChange:change,placeholder:'我的店铺'})))); }
    function LabRequestModal({modal,state,setModal,refresh,setToast}) {
      const providers=state.labProviders.filter(item=>item.status!=='paused');
      const [form,setForm]=useState({labId:modal.provider?.id||providers[0]?.id||'',methods:(modal.selectedMethods||[]).join('，'),sampleInfo:'',contact:''});
      const [loading,setLoading]=useState(false);
      const change=event=>setForm(current=>({...current,[event.target.name]:event.target.value}));
      const submit=async()=>{const selectedMethods=form.methods.split(/[，,\n]/).map(value=>value.trim()).filter(Boolean);if(!form.labId||!selectedMethods.length)return;setLoading(true);try{const request=await api('/api/lab/requests',{method:'POST',body:JSON.stringify({projectId:modal.project?.id||'',labId:form.labId,selectedMethods,sampleInfo:form.sampleInfo,contact:form.contact})});await refresh();setModal(null);setToast(`实验需求已提交给${request.labName}`);}catch(error){setToast(error.message);}finally{setLoading(false);}};
      return <Modal title="提交实验委托" setModal={setModal} actions={<button className="btn btn-primary" disabled={loading||!form.labId||!form.methods.trim()} onClick={submit}>{icon('send',15)}{loading?'正在提交…':'提交给实验室评估'}</button>}><div className="lab-request-intro">{icon('shield-check',19)}<p>平台先传递实验需求。实验室确认样本条件、执行方案、排期与报价后，项目才进入执行阶段。</p></div><div className="form-grid"><div className="field full"><label>选择实验室</label><select name="labId" value={form.labId} onChange={change}>{providers.map(provider=><option key={provider.id} value={provider.id}>{provider.name} · {provider.city}</option>)}</select></div><div className="field full"><label>需要完成的方法 *</label><textarea name="methods" value={form.methods} onChange={change} rows={3} placeholder="每项用逗号或换行分隔"/></div><div className="field full"><label>样本与实验条件</label><textarea name="sampleInfo" value={form.sampleInfo} onChange={change} rows={4} placeholder="样本类型、数量、保存条件、期望终点等"/></div><div className="field full"><label>联系信息</label><input name="contact" value={form.contact} onChange={change} placeholder="邮箱、电话或微信（选填）"/></div></div></Modal>;
    }
    function CheckoutModalNative({state,setModal,refresh,setToast}) {
      const lines = state.cart.map(line => ({...line, item:state.reagents.find(reagent => reagent.id === line.reagentId)})).filter(line => line.item);
      const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
      const [loading, setLoading] = useState(false);
      const [shipping,setShipping]=useState({recipient:'',phone:'',address:''});
      const [error,setError]=useState('');
      const [taskId,setTaskId]=useState(state.researchTasks.find(task=>task.projectId&&lines.some(line=>line.projectId===task.projectId))?.id||'');
      const prepare = async () => {
        setLoading(true);setError('');
        try {
          const result = await api('/api/orders/prepare-payment', { method:'POST', body:JSON.stringify({reagentIds:lines.map(line => line.item.id),taskId, ...shipping}) });
          await refresh();setModal({type:'payment',order:result.order});
          setToast('微信二维码已生成，请扫码支付');
        } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
      };
      const orderLines = lines.map(line => <div className="checkout-line" key={line.item.id}><span>{line.item.name} × {line.quantity}</span><strong>{money(line.item.price * line.quantity)}</strong></div>);
      if (!lines.length) return <Modal title="微信扫码支付" setModal={setModal}><div className="empty">购物清单为空。</div></Modal>;
      return <Modal title="确认订单" setModal={setModal} actions={<button className="btn btn-primary" onClick={prepare} disabled={loading||!state.settings.paymentEnabled||!shipping.recipient.trim()||!/^1\d{10}$/.test(shipping.phone)||shipping.address.trim().length<6}>{icon('qr-code',15)}{loading?'正在生成…':'生成微信支付二维码'}</button>}>
        <div className="checkout-lines">{orderLines}</div><div className="checkout-total"><span>应付合计</span><span className="price">{money(total)}</span></div>{!!state.researchTasks.length&&<div className="field checkout-task"><label htmlFor="checkout-task">关联科研任务</label><select id="checkout-task" value={taskId} onChange={event=>setTaskId(event.target.value)}><option value="">不关联任务</option>{state.researchTasks.map(task=><option key={task.id} value={task.id}>{task.topic}</option>)}</select></div>}
        <div className="form-grid checkout-shipping"><div className="field"><label htmlFor="checkout-recipient">收件人 *</label><input id="checkout-recipient" autoComplete="name" maxLength={80} value={shipping.recipient} onChange={event=>setShipping(current=>({...current,recipient:event.target.value}))}/></div><div className="field"><label htmlFor="checkout-phone">手机号 *</label><input id="checkout-phone" type="tel" inputMode="numeric" autoComplete="tel" maxLength={11} value={shipping.phone} onChange={event=>setShipping(current=>({...current,phone:event.target.value}))}/></div><div className="field full"><label htmlFor="checkout-address">收货地址 *</label><textarea id="checkout-address" autoComplete="street-address" rows={2} maxLength={400} value={shipping.address} onChange={event=>setShipping(current=>({...current,address:event.target.value}))}/></div></div>
        {!state.settings.paymentEnabled&&<div className="auth-error" role="alert">微信 Native 支付暂未开通，暂不能提交订单。</div>}{error&&<div className="auth-error" role="alert">{error}</div>}<p className="sub">二维码有效期 2 小时；付款以微信商户结果为准，未付款不能发货。</p>
      </Modal>;
    }
    function PaymentModal({order,setModal,refresh,setToast}) {
      const [paymentStatus,setPaymentStatus]=useState(order.paymentStatus);
      const [error,setError]=useState('');
      const [checking,setChecking]=useState(false);
      const checkingRef=useRef(false);
      const check=async()=>{if(checkingRef.current)return;checkingRef.current=true;setChecking(true);try{const result=await api(`/api/orders/${encodeURIComponent(order.id)}/payment`);setPaymentStatus(result.paymentStatus);setError('');if(result.paymentStatus==='paid'){await refresh();setToast('微信已确认付款，商家将安排发货');}}catch(requestError){setError(requestError.message);}finally{checkingRef.current=false;setChecking(false);}};
      useEffect(()=>{if(paymentStatus!=='pending')return;const timer=setInterval(check,5000);return()=>clearInterval(timer);},[paymentStatus]);
      return <Modal title="微信扫码支付" setModal={setModal} actions={<button className="btn btn-primary" onClick={paymentStatus==='pending'?check:()=>setModal(null)} disabled={checking}>{paymentStatus==='pending'?(checking?'正在核对…':'查询支付状态'):'关闭'}</button>}><div className="checkout-total"><span>订单 {order.id}</span><strong>{money(order.total)}</strong></div><div className="qr-preview payment-qr">{paymentStatus==='pending'&&order.payment?.qrUrl?<img src={order.payment.qrUrl} alt="微信 Native 支付二维码"/>:<div className="qr-placeholder">{paymentStatus==='paid'?'已付款':paymentStatus==='expired'?'二维码已过期':'等待人工处理'}</div>}<div><strong>{paymentStatus==='paid'?'微信已确认付款':paymentStatus==='pending'?'微信 Native 扫码支付':paymentStatus==='expired'?'支付已超时':'等待支付处理'}</strong><p className="sub">{paymentStatus==='pending'?'使用微信扫一扫；此窗口会自动查询付款结果，请勿重复下单。':'只有微信确认收款后，商家才可发货。'}</p></div></div>{error&&<div className="auth-error" role="alert">{error}<button onClick={check}>重试</button></div>}</Modal>;
    }
    function HelpModal({setModal}) { return <Modal title="使用帮助" setModal={setModal}><div className="help-content"><h3>生成研究方案</h3><p>输入科研课题，系统会检索 5 篇 PubMed 文献，并按 Methods 证据整理方法、试剂与材料。</p><h3>整理试剂</h3><p>在方法树中勾选需要的资源，或从试剂商城选择商品，再到购物清单核对规格与数量。</p><h3>发现实验室</h3><p>打开实验服务，提交方法和样本条件。查找附近资源时，可授权浏览器使用当前位置。</p></div></Modal>; }
    createRoot(document.getElementById('root')).render(h(App));
    if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register(BASE+'/sw.js').catch(()=>{}));
