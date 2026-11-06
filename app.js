// Pickleball Club Manager - Firebase-backed PWA starter.
// Paste your Firebase web app config into firebaseConfig below.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBmTyShKG-Uk_9JTrE9lFWiNfE-Adk0vWE",
  authDomain: "pickleball-club-manager-59d30.firebaseapp.com",
  projectId: "pickleball-club-manager-59d30",
  storageBucket: "pickleball-club-manager-59d30.firebasestorage.app",
  messagingSenderId: "538566979335",
  appId: "1:538566979335:web:492ebeed43aad79b9b1fa2"
};
const root=document; const $=id=>document.getElementById(id);
const show=(id,yes)=>$(id).classList.toggle('hidden',!yes);
let noticeTimer;

const note=(msg,error=false)=>{
  $('notice').textContent=msg;
  $('notice').classList.toggle('error',error);
  show('notice',true);

  clearTimeout(noticeTimer);

  noticeTimer=setTimeout(()=>{
    show('notice',false);
  },3500);
};
let auth,db,user,clubId,club,role,state,unsubState,unsubMembers,unsubRequests,tab='session',installPrompt;
let profilePlayerId=null, profileReturnTab='players';
const path=(...p)=>p.join('/');
const clubRef=()=>doc(db,'clubs',clubId);
const memberRef=uid=>doc(db,'clubs',clubId,'members',uid);
const stateRef=()=>doc(db,'clubs',clubId,'state','live');
const memberList=()=>collection(db,'clubs',clubId,'members');
const requestsRef=()=>collection(db,'clubs',clubId,'joinRequests');
const activePlayers=()=>state?.players||[];
const queue=()=>state?.queue||[];
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function configReady(){return firebaseConfig.apiKey!=='PASTE_API_KEY'&&firebaseConfig.projectId!=='PASTE_PROJECT_ID'}
function showOnly(id){['auth','clubGate','pending','main'].forEach(x=>show(x,x===id))}
function init(){
 if(!configReady()){showOnly('auth');note('Setup needed: add your Firebase web app configuration in app.js first.',true);return}
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,async u=>{user=u;if(!u){cleanup();showOnly('auth');return}showOnly('clubGate');await restoreMembership()});
}

async function restoreMembership(){
  const saved=localStorage.getItem('pbcm_club');
  if(!saved)return;

  clubId=saved;

  try{
    const [c,m]=await Promise.all([
      getDoc(clubRef()),
      getDoc(memberRef(user.uid))
    ]);

    if(c.exists()&&m.exists()&&m.data().active===true){
      club=c.data();
      role=m.data().role;
      enterClub();
    }else if(c.exists()){
      if(m.exists()&&m.data().active===false){
        $('pendingTitle').textContent='Club Access Removed';
        $('pendingMessage').textContent=
          'Your access to this club has been revoked. Please contact the club organizer if you believe this is a mistake or would like to request access again.';
      }else{
        $('pendingTitle').textContent='Request submitted';
        $('pendingMessage').textContent=
          'Your club organizer needs to approve your access. Keep this app installed and sign in again later.';
      }

      showOnly('pending');
    }
  }catch(e){
    note(e.message,true);
  }
}
$('signIn').onclick=async()=>{try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(e){note(e.message,true)}};
$('signUp').onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(e){note(e.message,true)}};
$('signOut').onclick=$('signOut2').onclick=$('logout').onclick=()=>signOut(auth);
$('createClub').onclick=async()=>{
 try{
  const name=$('newClubName').value.trim(),display=$('displayName').value.trim();if(!name||!display)return note('Enter your name and club name.',true);
  clubId='club-'+crypto.randomUUID().slice(0,8);
  await setDoc(clubRef(),{name,adminUid:user.uid,createdAt:serverTimestamp()});
  await setDoc(memberRef(user.uid),{uid:user.uid,email:user.email,displayName:display,role:'admin',active:true,joinedAt:serverTimestamp()});
  await setDoc(stateRef(),{players:[],queue:[],rounds:[],active:null,courts:2,format:'doubles',scoring:'traditional',target:11,winBy:2,partners:{},opponents:{},updatedAt:serverTimestamp()});
  localStorage.setItem('pbcm_club',clubId);club={name};role='admin';enterClub();
 }catch(e){note(e.message,true)}
};
$('requestJoin').onclick=async()=>{
 try{clubId=$('clubId').value.trim();let display=$('displayName').value.trim();if(!clubId||!display)return note('Enter your name and club ID.',true);
 const c=await getDoc(clubRef());if(!c.exists())return note('Club ID not found.',true);
 await setDoc(doc(db,'clubs',clubId,'joinRequests',user.uid),{uid:user.uid,email:user.email,displayName:display,status:'pending',requestedAt:serverTimestamp()});
 localStorage.setItem('pbcm_club',clubId);showOnly('pending');note('Access request sent. Ask your organizer to approve you.');
 }catch(e){note(e.message,true)}
};
$('pendingBack').onclick=restoreMembership;
function cleanup(){[unsubState,unsubMembers,unsubRequests].forEach(f=>f&&f());unsubState=unsubMembers=unsubRequests=null}
function enterClub(){
 showOnly('main');
 $('clubTitle').textContent=club.name;
 $('userRole').textContent=role==='admin'?'Club organizer':'Club member';
 cleanup();

 unsubState=onSnapshot(stateRef(),snap=>{
   if(!snap.exists()){
     note('Session data is missing.',true);
     return;
   }

   state=snap.data();

   // Initialize session tracking for existing clubs.
   if(!state.currentSession){
     state.currentSession={
       number:1,
       roundNumber:state.rounds?.length||0,
       startedAt:new Date().toISOString()
     };
     state.sessionRankings=[];

     saveState({
       currentSession:state.currentSession,
       sessionRankings:state.sessionRankings
     }).catch(e=>note(e.message,true));
   }

   render();
 },e=>note(e.message,true));
}
function saveState(patch){return updateDoc(stateRef(),{...patch,updatedAt:serverTimestamp()})}
function nm(id){return state.players.find(p=>p.id===id)?.name||'Removed'}
function teamText(ids){
  return ids.map(nm).map(esc).join(' & ');
}
function key(a,b){return [a,b].sort((x,y)=>x-y).join('_')}
function count(map,a,b){return map?.[key(a,b)]||0}
function inc(map,a,b){let k=key(a,b);map[k]=(map[k]||0)+1}
function cap(){return state.courts*(state.format==='doubles'?4:2)}
function pairTeams(ids){
  if(state.format==='singles'){
    return {team1:[ids[0]],team2:[ids[1]]};
  }
  
  let [a,b,c,d]=ids;
  let opts=[[[a,b],[c,d]],[[a,c],[b,d]],[[a,d],[b,c]]];
  let best=opts[0],low=Infinity;

  for(let teams of opts){
    let cost=count(state.partners,...teams[0])*1000+
             count(state.partners,...teams[1])*1000;

    for(let x of teams[0]){
      for(let y of teams[1]){
        cost+=count(state.opponents,x,y)*35+Math.random()*.5;
      }
    }

    if(cost<low){low=cost;best=teams}
  }

  return {team1:best[0],team2:best[1]};
}

async function generate(){
  if(state.active)return note('Finish the current round first.',true);

  let available=state.queue.filter(id=>state.players.some(p=>p.id===id&&p.active&&!p.archived));
  if(available.length<cap())return note(`Need ${cap()} active players; only ${available.length} are waiting.`,true);

  let ids=available.slice(0,cap()),size=state.format==='doubles'?4:2,matches=[];

  for(let i=0;i<state.courts;i++){
    let group=ids.slice(i*size,(i+1)*size);
    matches.push({
      court:i+1,
      ids:group,
      teams:pairTeams(group),
      score:[0,0],
      serving:0,
      server:state.format==='singles'?1:2,
      done:false,
      events:[]
    });
  }

  let q=state.queue.filter(id=>!ids.includes(id)).concat(ids);
  let players=state.players.map(p=>({
    ...p,
    games:p.games+(ids.includes(p.id)?1:0),
    waits:p.active&&!ids.includes(p.id)?p.waits+1:p.waits
  }));

  let currentSession={
    ...state.currentSession,
    roundNumber:(state.currentSession?.roundNumber||0)+1
  };

  await saveState({
    queue:q,
    players,
    currentSession,
    active:{
      number:currentSession.roundNumber,
      matches,
      started:new Date().toLocaleTimeString()
    }
  });
}

async function score(court,team){
 let m=state.active.matches.find(x=>x.court===court);if(!m||m.done)return;
 let old={score:[...m.score],serving:m.serving,server:m.server};m.events=[...(m.events||[]),old];
 if(state.scoring==='rally'){m.score[team]++;m.serving=team;m.server=1}
 else if(m.serving===team){m.score[team]++}
 else if(state.format==='singles'){m.serving=team;m.server=1}
 else if(m.server===1){m.server=2}
 else{m.serving=team;m.server=1}
 if(m.score[team]>=state.target&&m.score[team]-m.score[1-team]>=state.winBy)m.done=true;
 await saveState({active:{...state.active,matches:state.active.matches.map(x=>x.court===court?m:x)}});
}
async function undo(court){let m=state.active.matches.find(x=>x.court===court);if(!m?.events?.length)return;let old=m.events.pop();m.score=old.score;m.serving=old.serving;m.server=old.server;m.done=false;await saveState({active:{...state.active,matches:state.active.matches.map(x=>x.court===court?m:x)}})}
async function finish(closed=false){
 let a=state.active;if(!a)return;if(!closed&&a.matches.some(m=>!m.done))return;
 let players=state.players.map(p=>({...p})),partners={...state.partners},opponents={...state.opponents};
 for(let m of a.matches)if(!closed&&m.done){
  let w=m.score[0]>m.score[1]?0:1,l=1-w;
  let teams=[m.teams.team1,m.teams.team2];
teams[w].forEach(id=>{let p=players.find(x=>x.id===id);if(p)p.wins++});
teams[l].forEach(id=>{let p=players.find(x=>x.id===id);if(p)p.losses++});
if(state.format==='doubles'){
  inc(partners,...teams[0]);
  inc(partners,...teams[1]);
  for(let x of teams[0])for(let y of teams[1])inc(opponents,x,y);
}
}
await saveState({
  players,
  partners,
  opponents,
  rounds:[
    ...state.rounds,
    {
      ...a,
      sessionNumber:state.currentSession.number,
      sessionStartedAt:state.currentSession.startedAt,
      closed,
      ended:new Date().toLocaleTimeString(),
      endedAt:new Date().toISOString()
    }
  ],
  active:null
});
}
function view(title,sub=''){return `<section class="panel"><h2>${title}</h2><p class="muted small">${sub}</p></section>`}
function render(){
  if(!state)return;

  if(profilePlayerId){
    playerProfileView();
    return;
  }
  const tabs=document.querySelectorAll('.tabs button');
  tabs.forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  if(tab==='session')sessionView();
  if(tab==='ranking')rankingView();
  if(tab==='players')playersView();
  if(tab==='courts')courtsView();
  if(tab==='history')historyView();
  if(tab==='admin')adminView();
}
function sessionView(){
 let waiting=state.queue.filter(id=>state.players.some(p=>p.id===id&&p.active&&!p.archived));
 $('view').innerHTML=`<section class="panel"><h2>Session setup</h2><div class="grid2">
 <label>Courts<select id="courts">${[1,2,3,4,5,6].map(n=>`<option ${state.courts===n?'selected':''}>${n}</option>`).join('')}</select></label>
 <label>Format<select id="format"><option value="doubles" ${state.format==='doubles'?'selected':''}>Doubles</option><option value="singles" ${state.format==='singles'?'selected':''}>Singles</option></select></label>
 <label>Scoring<select id="scoring"><option value="traditional" ${state.scoring==='traditional'?'selected':''}>Traditional</option><option value="rally" ${state.scoring==='rally'?'selected':''}>Rally</option></select></label>
 <label>Target score<input id="target" type="number" min="1" max="99" value="${state.target}"></label>
 </div><label>Win by<select id="winBy"><option value="2" ${state.winBy===2?'selected':''}>2</option><option value="1" ${state.winBy===1?'selected':''}>1</option></select></label>
 <button class="secondary" id="apply">Apply settings</button><button class="primary full" id="generate" ${state.active?'disabled':''}>Generate next round</button>
 <p class="muted small">Capacity: ${cap()} players · ${waiting.length} in queue</p></section>
 <section class="panel"><h2>Waiting queue</h2>${waiting.map((id,i)=>`<div class="row"><b class="green">${i+1}</b><span class="grow">${esc(nm(id))}</span><span class="badge">${state.players.find(p=>p.id===id)?.games||0} games</span></div>`).join('')||'<p class="muted">No waiting players.</p>'}</section>
 ${state.active?'<section class="panel"><b>Round in progress</b><button class="primary full" id="goCourts">Open live courts</button></section>':''}`;
 $('apply').onclick=async()=>{if(state.active)return note('Finish the active round before changing courts or format.',true);await saveState({courts:+$('courts').value,format:$('format').value,scoring:$('scoring').value,target:Math.max(1,+$('target').value||11),winBy:+$('winBy').value})};
 $('generate').onclick=generate;if($('goCourts'))$('goCourts').onclick=()=>{tab='courts';render()};
}



function playersView(){
  const isAdmin=role==='admin';

  $('view').innerHTML=`
    <section class="panel">
      <h2>Players (${state.players.filter(p=>!p.archived).length})</h2>

      ${isAdmin?`
        <form id="add">
          <input id="playerName" placeholder="Player name" required>
          <button class="primary full">Add player</button>
        </form>
      `:''}

      <div class="player-tools">
        <input class="player-search" id="playerSearch" placeholder="Search players...">

        <div class="player-filters">
        <button class="secondary active" data-filter="all">All</button>
        <button class="secondary" data-filter="active">Active</button>
        <button class="secondary" data-filter="paused">Paused</button>
        <button class="secondary" data-filter="archived">Archived</button>
      </div>
      </div>

      <div id="playerList"></div>
    </section>
  `;

  let filter='all';

  function renderList(){
    const search=$('playerSearch').value.trim().toLowerCase();

    let players=state.players;

    if(filter==='archived'){
    players=players.filter(p=>p.archived);
    }else{
    players=players.filter(p=>!p.archived);

    if(filter==='active')players=players.filter(p=>p.active);
    if(filter==='paused')players=players.filter(p=>!p.active);
}

    players=players.filter(p=>p.name.toLowerCase().includes(search));

    $('playerList').innerHTML=players.length?
      players.map(p=>`
        <div class="row">
          <div class="grow">
            <b><a href="#" data-profile="${p.id}">${esc(p.name)}</a></b>
            <div class="muted small">
              ${p.games||0} games · ${p.wins||0} wins · ${p.losses||0} losses · ${p.waits||0} waits
            </div>
            <span class="player-status ${p.archived?'archived':p.active?'active':'paused'} small">
             ${p.archived?'Archived':p.active?'Active':'Paused'}
            </span>
          </div>

         ${isAdmin?`
            <div class="player-actions">
              ${p.archived?`
                <button class="primary small" data-restore="${p.id}">Restore</button>
                `:`
                <button class="secondary small" data-edit="${p.id}">Edit</button>
                <button class="secondary small" data-pause="${p.id}">
                  ${p.active?'Pause':'Activate'}
                </button>
                <button class="secondary small danger" data-archive="${p.id}">Remove</button>
              `}
            </div>
          `:''}
        </div>
      `).join('')
      :'<p class="player-empty">No players found.</p>';

    $('playerList').querySelectorAll('[data-profile]').forEach(b=>{
      b.onclick=e=>{
        e.preventDefault();
        openPlayerProfile(b.dataset.profile,'players');
      };
    });

    $('playerList').querySelectorAll('[data-restore]').forEach(b=>{
  b.onclick=async()=>{
    const id=b.dataset.restore;
    const player=state.players.find(p=>p.id===id);
    if(!player)return;

    if(!confirm(`Restore ${player.name} to the active club roster?`))return;

    await saveState({
      players:state.players.map(p=>
        p.id===id?{...p,archived:false,active:true}:p
      ),
      queue:state.queue.includes(id)
        ?state.queue
        :[...state.queue,id]
    });

    note(`${player.name} has been restored!`);
  };
}); 
    
    $('playerList').querySelectorAll('[data-edit]').forEach(b=>{
      b.onclick=async()=>{
        const id=b.dataset.edit;
        const player=state.players.find(p=>p.id===id);
        if(!player)return;

        const name=prompt('Edit player name:',player.name);
        if(name===null)return;

        const newName=name.trim();
        if(!newName)return note('Player name cannot be empty.',true);

        if(state.players.some(p=>p.id!==id&&!p.archived&&p.name.toLowerCase()===newName.toLowerCase())){
          return note('Player already exists.',true);
        }

        await saveState({
          players:state.players.map(p=>p.id===id?{...p,name:newName}:p)
        });
      };
    });

    $('playerList').querySelectorAll('[data-pause]').forEach(b=>{
      b.onclick=async()=>{
        const id=b.dataset.pause;

        if(state.active?.matches.some(m=>m.ids.includes(id))){
          return note('Player is currently playing.',true);
        }

        await saveState({
          players:state.players.map(p=>p.id===id?{...p,active:!p.active}:p)
        });
      };
    });

    $('playerList').querySelectorAll('[data-archive]').forEach(b=>{
      b.onclick=async()=>{
        const id=b.dataset.archive;
        const player=state.players.find(p=>p.id===id);
        if(!player)return;

        if(state.active?.matches.some(m=>m.ids.includes(id))){
          return note('Player is currently playing.',true);
        }

        if(!confirm(`Remove ${player.name} from the active club roster? Their match history and statistics will be preserved.`))return;

        await saveState({
          players:state.players.map(p=>p.id===id?{...p,archived:true,active:false}:p),
          queue:state.queue.filter(x=>x!==id)
        });
      };
    });
  }

  $('playerSearch').oninput=renderList;

  root.querySelectorAll('[data-filter]').forEach(b=>{
    b.onclick=()=>{
      filter=b.dataset.filter;

      root.querySelectorAll('[data-filter]').forEach(x=>{
        x.classList.toggle('active',x===b);
      });

      renderList();
    };
  });

  if(isAdmin){
    $('add').onsubmit=async e=>{
      e.preventDefault();

      const name=$('playerName').value.trim();

      if(state.players.some(p=>p.name.toLowerCase()===name.toLowerCase())){
        return note('Player already exists.',true);
      }

      const id=crypto.randomUUID();

      await saveState({
        players:[...state.players,{
          id,name,active:true,archived:false,
          games:0,wins:0,losses:0,waits:0
        }],
        queue:[...state.queue,id]
      });
    };
  }

  renderList();
}


async function startNewSession(){
  if(role!=='admin')return note('Only the club organizer can start a new session.',true);

  if(state.active)return note('Finish or close the active round before starting a new session.',true);

  if(!confirm('Start a new session? The current leaderboard will be saved, and current session stats will reset. Match history will remain.'))return;

  let previousRanking={
    number:state.currentSession.number,
    startedAt:state.currentSession.startedAt,
    endedAt:new Date().toISOString(),
    players:state.players.filter(p=>!p.archived).map(p=>({
      id:p.id,
      name:p.name,
      games:p.games||0,
      wins:p.wins||0,
      losses:p.losses||0
    }))
  };

  let sessionRankings=[
    ...(state.sessionRankings||[]),
    previousRanking
  ].slice(-2);

  let players=state.players.map(p=>p.archived?p:({
    ...p,
    games:0,
    wins:0,
    losses:0,
    waits:0
}));

  let currentSession={
    number:(state.currentSession.number||1)+1,
    roundNumber:0,
    startedAt:new Date().toISOString()
  };

  await saveState({
    players,
    sessionRankings,
    currentSession
  });

  note('New session started!');
}

function courtsView(){
  let html='';

  if(!state.active){
    html+=view('No active round','Generate a round from the Session tab.');
  }else{
    html+=`<section class="panel">
     <h2>Current Session</h2>
      <p class="muted small">${state.active.started}</p>
    </section>`;

    for(let m of state.active.matches){
      html+=`<section class="match">
        <div class="muted small">COURT ${m.court} · ${m.done?'FINISHED':state.scoring.toUpperCase()}</div>
        <div class="teams">
          <div>
            <div class="teamname">${teamText(m.teams.team1)}</div>
            <div class="score">${m.score[0]}</div>
            ${m.serving===0&&!m.done?'<span class="green small">SERVING</span>':''}
          </div>
          <b class="muted">VS</b>
          <div>
            <div class="teamname">${teamText(m.teams.team2)}</div>
            <div class="score">${m.score[1]}</div>
            ${m.serving===1&&!m.done?'<span class="green small">SERVING</span>':''}
          </div>
        </div>
        ${m.done?'<p class="green">Match completed</p>':`
          <div class="scorebtns">
            <button class="primary" data-score="${m.court}-0">Team 1 won rally</button>
            <button class="primary" data-score="${m.court}-1">Team 2 won rally</button>
          </div>
          <button class="secondary full" data-undo="${m.court}">Undo last rally</button>
        `}
      </section>`;
    }

    html+=`<section class="panel">
      <button class="primary full" id="finish" ${state.active.matches.some(m=>!m.done)?'disabled':''}>Complete round</button>
      <button class="secondary full" id="closeRound">Close round without results</button>
    </section>`;
  }

  if(role==='admin'){
    html+=`<section class="panel">
     <h2>Current Session</h2>
      <p class="muted small">Starting a new session saves the current ranking and resets session statistics.</p>
      <button class="secondary full" id="startNewSession" ${state.active?'disabled':''}>Start New Session</button>
    </section>`;
  }

  $('view').innerHTML=html;

  root.querySelectorAll('[data-score]').forEach(b=>{
    b.onclick=()=>{
      let [c,t]=b.dataset.score.split('-');
      score(+c,+t);
    };
  });

  root.querySelectorAll('[data-undo]').forEach(b=>{
    b.onclick=()=>undo(+b.dataset.undo);
  });

  if($('finish'))$('finish').onclick=()=>finish();

  if($('closeRound')){
    $('closeRound').onclick=()=>{
      if(confirm('Close this round without recording results?'))finish(true);
    };
  }

  if($('startNewSession')){
    $('startNewSession').onclick=startNewSession;
  }
}



function rankingView(){
  const currentPlayers=[...(state.players||[])]
    .filter(p=>!p.archived)
    .sort((a,b)=>{
      if((b.wins||0)!==(a.wins||0)){
        return (b.wins||0)-(a.wins||0);
      }

      const aPct=a.games?(a.wins||0)/a.games:0;
      const bPct=b.games?(b.wins||0)/b.games:0;

      return bPct-aPct;
    });

  const previousSessions=[
    ...(state.sessionRankings||[])
  ].slice(-2).reverse();

  function rankingTable(players){
    if(!players?.length){
      return '<p class="muted">No ranking data yet.</p>';
    }

    const sorted=[...players].sort((a,b)=>{
      if((b.wins||0)!==(a.wins||0)){
        return (b.wins||0)-(a.wins||0);
      }

      const aPct=a.games?(a.wins||0)/a.games:0;
      const bPct=b.games?(b.wins||0)/b.games:0;

      return bPct-aPct;
    });

    return sorted.slice(0,5).map((p,i)=>{
      const games=p.games||0;
      const wins=p.wins||0;
      const losses=p.losses||0;
      const percentage=games?((wins/games)*100).toFixed(1):'0.0';

      return `
        <div class="row">
          <b class="green">${['🥇','🥈','🥉'][i]||'#'+(i+1)}</b>
          <div class="grow">
            <b><a href="#" data-profile="${esc(p.id)}">${esc(p.name)}</a></b>
            <div class="muted small">
              ${games} games · ${wins} wins · ${losses} losses
            </div>
          </div>
          <span class="badge">${percentage}%</span>
        </div>
      `;
    }).join('');
  }

  $('view').innerHTML=`
    <section class="panel">
      <h2>Current Session #${state.currentSession?.number||1}</h2>
      <p class="muted small">Live player rankings for the current session.</p>
      ${rankingTable(currentPlayers)}
    </section>

    <section class="panel">
      <h2>Previous Sessions</h2>
      <p class="muted small">Compare the two most recently completed sessions.</p>

      ${previousSessions.length?
        previousSessions.map(session=>{
          const date=session.endedAt||session.startedAt;
          const formattedDate=date
            ?new Date(date).toLocaleDateString(undefined,{
              year:'numeric',
              month:'long',
              day:'numeric'
            })
            :'Date unavailable';

          return `
            <div class="session-ranking">
              <h3>Session #${session.number}</h3>
              <p class="muted small">${formattedDate}</p>
              ${rankingTable(session.players)}
            </div>
          `;
        }).join('<hr>')
        :'<p class="muted">No previous session rankings yet. They will appear here after starting a new session.</p>'
      }
    </section>
  `;

  root.querySelectorAll('[data-profile]').forEach(b=>{
    b.onclick=e=>{
      e.preventDefault();
      openPlayerProfile(b.dataset.profile,'ranking');
    };
  });
}



function openPlayerProfile(playerId,returnTab='players'){
  profilePlayerId=playerId;
  profileReturnTab=returnTab;
  playerProfileView();
}

function playerProfileView(){
  const player=state.players.find(p=>p.id===profilePlayerId);

  if(!player){
    tab=profileReturnTab;
    render();
    return;
  }

  let matches=[];

  (state.rounds||[]).forEach(round=>{
    (round.matches||[]).forEach(match=>{
      if(!match.done)return;

      let team1=match.teams.team1||[];
      let team2=match.teams.team2||[];

      if(!team1.includes(player.id)&&!team2.includes(player.id))return;

      let playerTeam=team1.includes(player.id)?0:1;
      let won=match.score[playerTeam]>match.score[1-playerTeam];

      matches.push({
        round:round.number,
        court:match.court,
        teams:match.teams,
        score:match.score,
        won,
        ended:round.ended,
        endedAt:round.endedAt
      });
    });
  });

  let wins=matches.filter(m=>m.won).length;
  let losses=matches.length-wins;
  let percentage=matches.length?(wins/matches.length*100).toFixed(1):'0.0';

  let partners={};
  let opponents={};

  matches.forEach(match=>{
    let team1=match.teams.team1||[];
    let team2=match.teams.team2||[];
    let myTeam=team1.includes(player.id)?team1:team2;
    let otherTeam=team1.includes(player.id)?team2:team1;

    myTeam.filter(id=>id!==player.id).forEach(id=>{
      partners[id]=(partners[id]||0)+1;
    });

    otherTeam.forEach(id=>{
      opponents[id]=(opponents[id]||0)+1;
    });
  });

  function peopleList(counts){
    return Object.entries(counts)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,5)
      .map(([id,total])=>`
        <div class="row">
          <span class="grow">${esc(nm(id))}</span>
          <span class="badge">${total} matches</span>
        </div>
      `).join('')||'<p class="muted small">No match data yet.</p>';
  }

  let recent=[...matches].reverse().slice(0,10);

  $('view').innerHTML=`
    <section class="panel">
      <button class="secondary" id="profileBack">← Back</button>
      <h2>${esc(player.name)}</h2>
      <p class="muted small">Player Profile</p>
    </section>

    <section class="panel">
      <h2>Career Statistics</h2>
      <div class="grid2">
        <div>
          <div class="score">${matches.length}</div>
          <div class="muted small">Games played</div>
        </div>
        <div>
          <div class="score">${percentage}%</div>
          <div class="muted small">Win percentage</div>
        </div>
        <div>
          <div class="score green">${wins}</div>
          <div class="muted small">Wins</div>
        </div>
        <div>
          <div class="score">${losses}</div>
          <div class="muted small">Losses</div>
        </div>
      </div>
    </section>

    <section class="panel">
  <h2>Best Partners</h2>
  ${peopleList(partners)}
</section>

    <section class="panel">
      <h2>Most Frequent Opponents</h2>
      ${peopleList(opponents)}
    </section>

    <section class="panel">
      <h2>Recent Matches</h2>
      ${recent.length?recent.map(m=>{
        let teams=[m.teams.team1,m.teams.team2];
        return `
          <div class="row">
            <div class="grow">
              <b>Round ${m.round} · Court ${m.court}</b>
              <div class="muted small">
                ${teamText(teams[0])} ${m.score[0]} - ${m.score[1]} ${teamText(teams[1])}
              </div>
            </div>
            <span class="badge">${m.won?'WIN':'LOSS'}</span>
          </div>
        `;
      }).join(''):'<p class="muted">No completed matches yet.</p>'}
    </section>
  `;

  $('profileBack').onclick=()=>{
    profilePlayerId=null;
    tab=profileReturnTab;
    render();
  };
}



function historyView(){
  const allMatches=(state.rounds||[]).slice().reverse().flatMap(round=>
    (round.matches||[])
      .filter(m=>m.done)
      .map(m=>({
        round:round.number,
        sessionNumber:round.sessionNumber,
        court:m.court,
        teams:m.teams,
        score:m.score,
        ended:round.ended,
        endedAt:round.endedAt
      }))
  );

  const sessions=[...new Set(
    allMatches.map(m=>m.sessionNumber).filter(n=>n!=null)
  )].sort((a,b)=>b-a);

  const players=[...(state.players||[])].sort((a,b)=>
    a.name.localeCompare(b.name)
  );

  let sessionFilter='all';
  let playerFilter='all';
  let dateFilter='';

  function renderHistory(){
    let matches=allMatches.filter(m=>{
      const sessionMatch=sessionFilter==='all'||
        String(m.sessionNumber)===sessionFilter;

      const playerMatch=playerFilter==='all'||
        [...(m.teams.team1||[]),...(m.teams.team2||[])]
          .includes(playerFilter);

      const matchDate=m.endedAt?m.endedAt.slice(0,10):'';
      const dateMatch=!dateFilter||matchDate===dateFilter;

      return sessionMatch&&playerMatch&&dateMatch;
    });

    $('view').innerHTML=`
      <section class="panel">
        <h2>Match History</h2>
        <p class="muted small">Filter and review completed matches.</p>

        <label>Session
          <select id="historySession">
            <option value="all">All sessions</option>
            ${sessions.map(n=>
              `<option value="${n}" ${sessionFilter===String(n)?'selected':''}>Session #${n}</option>`
            ).join('')}
          </select>
        </label>

        <label>Player
          <select id="historyPlayer">
            <option value="all">All players</option>
            ${players.map(p=>
              `<option value="${esc(p.id)}" ${playerFilter===p.id?'selected':''}>${esc(p.name)}</option>`
            ).join('')}
          </select>
        </label>

        <label>Date
          <input type="date" id="historyDate" value="${dateFilter}">
        </label>

        <button class="secondary full" id="resetHistory">Reset Filters</button>

        <p class="muted small">${matches.length} completed matches found</p>
      </section>

      ${matches.length?matches.map(m=>{
        const winner=m.score[0]>m.score[1]?0:1;
        const teams=[m.teams.team1,m.teams.team2];
        const date=m.endedAt
          ?new Date(m.endedAt).toLocaleDateString()
          :'Date unavailable';

        return `
          <section class="panel">
            <div class="row">
              <b>Session #${m.sessionNumber??'—'} · Round ${m.round} · Court ${m.court}</b>
            </div>
            <p class="muted small">${date} · ${esc(m.ended||'')}</p>

            <div class="teams">
              <div>
                <div class="teamname">${teamText(teams[0])}</div>
                <div class="score">${m.score[0]}</div>
                ${winner===0?'<span class="green small">WINNER</span>':''}
              </div>

              <b class="muted">VS</b>

              <div>
                <div class="teamname">${teamText(teams[1])}</div>
                <div class="score">${m.score[1]}</div>
                ${winner===1?'<span class="green small">WINNER</span>':''}
              </div>
            </div>
          </section>
        `;
      }).join(''):'<section class="panel"><p class="muted">No completed matches found for these filters.</p></section>'}
    `;

    $('historySession').onchange=e=>{
      sessionFilter=e.target.value;
      renderHistory();
    };

    $('historyPlayer').onchange=e=>{
      playerFilter=e.target.value;
      renderHistory();
    };

    $('historyDate').onchange=e=>{
      dateFilter=e.target.value;
      renderHistory();
    };

    $('resetHistory').onclick=()=>{
      sessionFilter='all';
      playerFilter='all';
      dateFilter='';
      renderHistory();
    };
  }

  renderHistory();
}


function adminView(){
  const isAdmin=role==='admin';
  const description=club.description||'';

  $('view').innerHTML=`
    <section class="panel">
      <h2>Club Details</h2>
      ${isAdmin?`
        <label>Club Name
          <input id="clubName" value="${esc(club.name||'')}" maxlength="60">
        </label>
        <label>Club Description
          <textarea id="clubDescription" rows="3" maxlength="300" placeholder="Tell members about your club...">${esc(description)}</textarea>
        </label>
        <button id="saveClubDetails" class="primary full">Save Club Details</button>
      `:`
        <h3>${esc(club.name||'')}</h3>
        <p class="muted">${esc(description||'No club description yet.')}</p>
      `}
    </section>

    <section class="panel">
      <h2>Club Access</h2>
      <p class="muted small">Share this club ID with members. They must request access and be approved by an organizer.</p>
      <div class="badge">${esc(clubId)}</div>
      <button id="copyId" class="secondary full">Copy Club ID</button>
    </section>

    <section class="panel">
      <h2>Pending Requests</h2>
      <div id="requests" class="muted small">Loading requests…</div>
    </section>

    <section class="panel">
      <h2>Club Members</h2>
      <div id="members" class="muted small">Loading members…</div>
    </section>
  `;

  $('copyId').onclick=()=>navigator.clipboard.writeText(clubId).then(()=>note('Club ID copied.'));

  if(isAdmin){
    $('saveClubDetails').onclick=async()=>{
      const name=$('clubName').value.trim();
      const description=$('clubDescription').value.trim();

      if(!name)return note('Club name cannot be empty.',true);

      try{
        await updateDoc(clubRef(),{name,description});
        club={...club,name,description};
        $('clubTitle').textContent=name;
        note('Club details updated successfully!');
      }catch(e){
        note(e.message,true);
      }
    };
  }

  if(unsubRequests)unsubRequests();
  if(unsubMembers)unsubMembers();

  if(isAdmin){
    unsubRequests=onSnapshot(requestsRef(),snap=>{
      let el=$('requests');
      if(!el)return;

      let pending=snap.docs.filter(d=>d.data().status==='pending');

      el.innerHTML=pending.length?pending.map(d=>{
        let x=d.data();
        return `<div class="row">
          <div class="grow">${esc(x.displayName)}
            <div class="muted">${esc(x.email)}</div>
          </div>
          <button class="primary" data-approve="${d.id}">Approve</button>
        </div>`;
      }).join(''):'No pending requests.';

      el.querySelectorAll('[data-approve]').forEach(b=>{
        b.onclick=async()=>{
          let uid=b.dataset.approve;
          let req=await getDoc(doc(db,'clubs',clubId,'joinRequests',uid));
          if(!req.exists())return;

          let x=req.data();

          await setDoc(memberRef(uid),{
            uid,email:x.email,displayName:x.displayName,
            role:'member',active:true,joinedAt:serverTimestamp()
          });

          await updateDoc(doc(db,'clubs',clubId,'joinRequests',uid),{
            status:'approved'
          });
        };
      });
    });

    unsubMembers=onSnapshot(memberList(),snap=>{
      let el=$('members');
      if(!el)return;

      el.innerHTML=snap.docs.map(d=>{
        let x=d.data();
        const isActive=x.active===true;
        const isOrganizer=x.role==='admin';

        return `<div class="row">
          <div class="grow">
            <b>${esc(x.displayName||x.email)}</b>
            <div class="muted small">${esc(x.email||'')}</div>
            <span class="player-status ${isActive?'active':'archived'} small">
              ${isActive?'Active':'Removed'}
            </span>
          </div>

          <div class="player-actions">
            <span class="badge">${esc(x.role)}</span>
            ${!isOrganizer&&d.id!==user.uid?`
              ${isActive?`
                <button class="secondary small danger" data-remove-member="${d.id}">
                  Remove
                </button>
              `:`
                <button class="primary small" data-restore-member="${d.id}">
                  Restore
                </button>
              `}
            `:''}
          </div>
        </div>`;
      }).join('');

      el.querySelectorAll('[data-remove-member]').forEach(b=>{
        b.onclick=async()=>{
          const uid=b.dataset.removeMember;
          const member=snap.docs.find(d=>d.id===uid)?.data();
          if(!member)return;

          const name=member.displayName||member.email||'this member';

          if(!confirm(`Remove ${name} from this club? They will lose access, but their player records and match history will remain.`))return;

          try{
            await updateDoc(memberRef(uid),{
              active:false,
              removedAt:serverTimestamp(),
              removedBy:user.uid
            });

            note(`${name} has been removed from the club.`);
          }catch(e){
            note(e.message,true);
          }
        };
      });
                el.querySelectorAll('[data-restore-member]').forEach(b=>{
        b.onclick=async()=>{
          const uid=b.dataset.restoreMember;
          const member=snap.docs.find(d=>d.id===uid)?.data();
          if(!member)return;

          const name=member.displayName||member.email||'this member';

          if(!confirm(`Restore ${name}'s access to this club?`))return;

          try{
            await updateDoc(memberRef(uid),{
              active:true,
              restoredAt:serverTimestamp(),
              restoredBy:user.uid
            });

            note(`${name} has been restored to the club.`);
          }catch(e){
            note(e.message,true);
          }
        };
      });
    });
  }else{
    $('requests').textContent='Only club organizers can approve requests.';
    $('members').textContent='Only club organizers can view the member list.';
  }
}

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  profilePlayerId=null;
  tab=b.dataset.tab;
  render();
});
$('logout').onclick=()=>signOut(auth);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;show('installBtn',true)});
$('installBtn').onclick=async()=>{if(installPrompt){installPrompt.prompt();installPrompt=null;show('installBtn',false)}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
init();
