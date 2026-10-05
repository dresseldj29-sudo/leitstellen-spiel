import {
  initializeApp
} from
"https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from
"https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from
"https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  onDisconnect
} from
"https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";


/* ==================================================
   1. DEINE FIREBASE CONFIG
   ================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDWD0EX3qY-JO-5TRRKO2UVaV3XXEkiFDk",
  authDomain: "ils-leitstellen-rp.firebaseapp.com",
  projectId: "ils-leitstellen-rp",
  storageBucket: "ils-leitstellen-rp.firebasestorage.app",
  messagingSenderId: "1052245341584",
  appId: "1:1052245341584:web:25bbbbc7aeb910eb7e6f15",
  measurementId: "G-EDG6QHJ1PN"
};


/* ==================================================
   2. FIREBASE STARTEN
   ================================================== */

const app =
  initializeApp(firebaseConfig);

const auth =
  getAuth(app);

const db =
  getFirestore(app);

const realtime =
  getDatabase(app);


/* ==================================================
   3. SPIELDATEN
   ================================================== */

let currentUser = null;
let currentServer = null;
let map = null;

let vehicleMarkers = {};
let incidentMarkers = {};

let vehicles = {};

let selectedVehicle = null;


/* ==================================================
   4. LOGIN / REGISTRIERUNG
   ================================================== */

window.showLogin = function(){

  document.getElementById("loginForm")
    .style.display="block";

  document.getElementById("registerForm")
    .style.display="none";

  document.getElementById("loginTab")
    .classList.add("active");

  document.getElementById("registerTab")
    .classList.remove("active");

};


window.showRegister = function(){

  document.getElementById("loginForm")
    .style.display="none";

  document.getElementById("registerForm")
    .style.display="block";

  document.getElementById("loginTab")
    .classList.remove("active");

  document.getElementById("registerTab")
    .classList.add("active");

};


window.registerUser = async function(){

  const name =
    document.getElementById("registerName").value.trim();

  const email =
    document.getElementById("registerEmail").value.trim();

  const password =
    document.getElementById("registerPassword").value;

  if(!name || !email || !password){

    showAuthMessage(
      "Bitte alle Felder ausfüllen."
    );

    return;
  }

  if(password.length < 6){

    showAuthMessage(
      "Das Passwort muss mindestens 6 Zeichen haben."
    );

    return;
  }

  try{

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    await updateProfile(
      credential.user,
      {
        displayName:name
      }
    );

    await setDoc(
      doc(db,"users",credential.user.uid),
      {
        displayName:name,
        email:email,
        createdAt:serverTimestamp()
      }
    );

  }
  catch(error){

    showAuthMessage(
      firebaseError(error)
    );

  }

};


window.loginUser = async function(){

  const email =
    document.getElementById("loginEmail").value.trim();

  const password =
    document.getElementById("loginPassword").value;

  try{

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

  }
  catch(error){

    showAuthMessage(
      firebaseError(error)
    );

  }

};


window.logoutUser = async function(){

  await signOut(auth);

};


function showAuthMessage(message){

  document.getElementById("authMessage")
    .textContent=message;

}


function firebaseError(error){

  const code=error.code || "";

  const messages={

    "auth/invalid-credential":
      "E-Mail oder Passwort ist falsch.",

    "auth/email-already-in-use":
      "Diese E-Mail wird bereits verwendet.",

    "auth/invalid-email":
      "Ungültige E-Mail-Adresse.",

    "auth/weak-password":
      "Das Passwort ist zu schwach."

  };

  return messages[code] ||
    "Firebase-Fehler: "+code;

}


/* ==================================================
   5. AUTH STATE
   ================================================== */

onAuthStateChanged(
  auth,
  async user=>{

    if(user){

      currentUser=user;

      document.getElementById("loginScreen")
        .style.display="none";

      document.getElementById("game")
        .style.display="block";

      await initializeGame();

    }
    else{

      currentUser=null;

      document.getElementById("loginScreen")
        .style.display="flex";

      document.getElementById("game")
        .style.display="none";

    }

  }
);


/* ==================================================
   6. KARTE
   ================================================== */

function initializeMap(){

  if(map)
    return;

  map =
    L.map("map")
    .setView(
      [49.4521,11.0767],
      13
    );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom:19,
      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(map);

}


/* ==================================================
   7. SPIEL INITIALISIEREN
   ================================================== */

async function initializeGame(){

  initializeMap();

  renderDefaultVehicles();

  document.getElementById("playerList")
    .textContent =
      currentUser.displayName ||
      currentUser.email;

  /*
   * Für den ersten Start automatisch einen
   * öffentlichen Demo-Server verwenden.
   */

  const saved =
    localStorage.getItem("currentServer");

  if(saved){

    await joinServerById(saved);

  }
  else{

    await createDefaultServer();

  }

}


/* ==================================================
   8. DEMO SERVER
   ================================================== */

async function createDefaultServer(){

  const serverRef =
    doc(collection(db,"servers"));

  const server={

    name:"Feuerwehr RP",

    code:
      "DEMO-"+

      Math.floor(
        1000+
        Math.random()*9000
      ),

    ownerId:
      currentUser.uid,

    members:{
      [currentUser.uid]:true
    },

    createdAt:
      serverTimestamp()

  };

  await setDoc(
    serverRef,
    server
  );

  await joinServerById(
    serverRef.id
  );

}


async function joinServerById(serverId){

  const serverSnap =
    await getDoc(
      doc(db,"servers",serverId)
    );

  if(!serverSnap.exists()){

    return;

  }

  currentServer={
    id:serverId,
    ...serverSnap.data()
  };

  localStorage.setItem(
    "currentServer",
    serverId
  );

  document.getElementById("serverName")
    .textContent =
      currentServer.name;

  document.getElementById("serverCode")
    .textContent =
      "("+currentServer.code+")";

  listenToVehicles();
  listenToIncidents();
  listenToPlayers();

}


/* ==================================================
   9. SERVER ERSTELLEN
   ================================================== */

window.openServerDialog=function(){

  document.getElementById("serverDialog")
    .style.display="flex";

};


window.createServer=async function(){

  const name =
    document.getElementById("newServerName")
    .value.trim();

  if(!name)
    return;

  const code =
    "FF-"+

    Math.floor(
      1000+
      Math.random()*9000
    );

  const serverRef =
    doc(collection(db,"servers"));

  await setDoc(
    serverRef,
    {

      name:name,

      code:code,

      ownerId:
        currentUser.uid,

      members:{
        [currentUser.uid]:true
      },

      createdAt:
        serverTimestamp()

    }
  );

  await joinServerById(
    serverRef.id
  );

  closeModal("serverDialog");

  alert(
    "Server erstellt!\n\nCode: "+
    code
  );

};


/* ==================================================
   10. SERVER BEITRETEN
   ================================================== */

window.joinServer=async function(){

  const code =
    document.getElementById("joinServerCode")
    .value.trim();

  if(!code)
    return;

  const q =
    query(
      collection(db,"servers")
    );

  let found=null;

  /*
   * Für eine kleine erste Version:
   * Server werden clientseitig gesucht.
   */

  const snapshot =
    await new Promise(resolve=>{

      const stop =
        onSnapshot(
          q,
          snap=>{
            stop();
            resolve(snap);
          }
        );

    });

  snapshot.forEach(serverDoc=>{

    const data=serverDoc.data();

    if(data.code===code){

      found={
        id:serverDoc.id,
        ...data
      };

    }

  });

  if(!found){

    alert(
      "Server nicht gefunden."
    );

    return;
  }

  await updateDoc(
    doc(db,"servers",found.id),
    {
      [`members.${currentUser.uid}`]:
        true
    }
  );

  await joinServerById(
    found.id
  );

  closeModal("serverDialog");

};


/* ==================================================
   11. STANDARDFAHRZEUGE
   ================================================== */

function renderDefaultVehicles(){

  const defaults={

    hlf20:{
      name:"HLF 20",
      type:"Feuerwehr",
      icon:"🚒",
      status:"ready",
      maxCrew:9,
      lat:49.4521,
      lng:11.0767
    },

    dlk:{
      name:"DLK 23/12",
      type:"Feuerwehr",
      icon:"🚒",
      status:"ready",
      maxCrew:3,
      lat:49.4550,
      lng:11.0810
    },

    tlf:{
      name:"TLF 3000",
      type:"Feuerwehr",
      icon:"🚒",
      status:"ready",
      maxCrew:6,
      lat:49.4490,
      lng:11.0710
    },

    rtw1:{
      name:"RTW 1",
      type:"Rettungsdienst",
      icon:"🚑",
      status:"ready",
      maxCrew:3,
      lat:49.4480,
      lng:11.0850
    },

    nef:{
      name:"NEF 1",
      type:"Rettungsdienst",
      icon:"🚑",
      status:"ready",
      maxCrew:2,
      lat:49.4570,
      lng:11.0690
    },

    pol1:{
      name:"Streifenwagen 1",
      type:"Polizei",
      icon:"🚓",
      status:"ready",
      maxCrew:2,
      lat:49.4510,
      lng:11.0880
    }

  };

  Object.entries(defaults)
    .forEach(
      ([id,v])=>{

        vehicles[id]=v;

      }
    );

  renderVehicles();

}


/* ==================================================
   12. LIVE FAHRZEUGE
   ================================================== */

function listenToVehicles(){

  if(!currentServer)
    return;

  const vehicleRef =
    ref(
      realtime,
      "servers/"+
      currentServer.id+
      "/vehicles"
    );

  onValue(
    vehicleRef,
    snapshot=>{

      const data =
        snapshot.val();

      if(data){

        vehicles=data;

        renderVehicles();

      }

    }
  );

}


/* ==================================================
   13. FAHRZEUGE ZEIGEN
   ================================================== */

function renderVehicles(){

  const list =
    document.getElementById(
      "vehicleList"
    );

  list.innerHTML="";

  Object.entries(vehicles)
    .forEach(
      ([id,v])=>{

        const crew =
          v.crew
          ? Object.keys(v.crew).length
          : 0;

        const card =
          document.createElement("div");

        card.className=
          "vehicle-card";

        card.innerHTML=`

          <div class="vehicle-name">
            ${v.icon} ${v.name}
          </div>

          <div class="small">
            ${v.type}
          </div>

          <span class="status ${v.status}">
            ${statusText(v.status)}
          </span>

          <div class="small">
            👥 ${crew}/${v.maxCrew}
          </div>

          <div class="vehicle-buttons">

            <button
              onclick="takeSeat('${id}')">
              👥 Besetzen
            </button>

            <button
              onclick="selectVehicle('${id}')">
              🗺 Karte
            </button>

          </div>

        `;

        list.appendChild(card);

        updateVehicleMarker(
          id,
          v
        );

      }
    );

}


function statusText(status){

  if(status==="ready")
    return "🟢 Einsatzbereit";

  if(status==="enroute")
    return "🟡 Auf Anfahrt";

  if(status==="busy")
    return "🔴 Im Einsatz";

  return "⚫ Außer Dienst";

}


/* ==================================================
   14. FAHRZEUG MARKER
   ================================================== */

function updateVehicleMarker(id,v){

  if(!map)
    return;

  if(vehicleMarkers[id]){

    vehicleMarkers[id]
      .setLatLng([
        v.lat,
        v.lng
      ]);

    return;

  }

  const icon =
    L.divIcon({

      html:`

        <div style="
          width:40px;
          height:40px;
          border-radius:50%;
          background:#208cff;
          border:3px solid white;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:20px;
          box-shadow:0 2px 10px #000;
        ">
          ${v.icon}
        </div>

      `,

      iconSize:[40,40],
      iconAnchor:[20,20]

    });

  vehicleMarkers[id] =
    L.marker(
      [v.lat,v.lng],
      {icon}
    )
    .addTo(map)
    .bindPopup(
      `<b>${v.icon} ${v.name}</b>`
    );

}


window.selectVehicle=function(id){

  const v=vehicles[id];

  if(!v)
    return;

  map.setView(
    [v.lat,v.lng],
    16
  );

};


/* ==================================================
   15. FAHRZEUG BESETZEN
   ================================================== */

window.takeSeat=async function(id){

  if(!currentServer)
    return;

  const vehicle =
    vehicles[id];

  if(!vehicle)
    return;

  const crewPath =
    ref(
      realtime,
      "servers/"+
      currentServer.id+
      "/vehicles/"+
      id+
      "/crew/"+
      currentUser.uid
    );

  await set(
    crewPath,
    {
      uid:currentUser.uid,
      name:
        currentUser.displayName ||
        currentUser.email,
      joinedAt:
        Date.now()
    }
  );

  /*
   * Wenn der Spieler die Seite verlässt,
   * wird sein Sitz automatisch entfernt.
   */

  onDisconnect(
    crewPath
  ).remove();

};


/* ==================================================
   16. EINSATZFORMULAR
   ================================================== */

window.openIncidentDialog=function(){

  document.getElementById("incidentDialog")
    .style.display="flex";

};


window.createIncident=async function(){

  if(!currentServer)
    return;

  const address =
    document.getElementById(
      "incidentAddress"
    ).value.trim();

  const city =
    document.getElementById(
      "incidentCity"
    ).value.trim();

  const keyword =
    document.getElementById(
      "incidentKeyword"
    ).value;

  const description =
    document.getElementById(
      "incidentDescription"
    ).value;

  const notes =
    document.getElementById(
      "incidentNotes"
    ).value;

  if(!address){

    alert(
      "Bitte eine Adresse eingeben."
    );

    return;

  }

  const resources =
    [...document.querySelectorAll(
      ".resource:checked"
    )]
    .map(x=>x.value);

  const incident = {

    serverId:
      currentServer.id,

    keyword,

    address:
      address+", "+city,

    city,

    description,

    notes,

    resources,

    status:"offen",

    createdBy:
      currentUser.uid,

    createdByName:
      currentUser.displayName ||
      currentUser.email,

    createdAt:
      serverTimestamp(),

    lat:
      49.4521+
      (Math.random()-.5)*.04,

    lng:
      11.0767+
      (Math.random()-.5)*.05

  };

  await addDoc(
    collection(
      db,
      "servers",
      currentServer.id,
      "incidents"
    ),
    incident
  );

  closeModal(
    "incidentDialog"
  );

};


/* ==================================================
   17. LIVE EINSÄTZE
   ================================================== */

function listenToIncidents(){

  if(!currentServer)
    return;

  const incidentsRef =
    collection(
      db,
      "servers",
      currentServer.id,
      "incidents"
    );

  onSnapshot(
    incidentsRef,
    snapshot=>{

      const list=[];

      snapshot.forEach(
        docSnap=>{

          list.push({
            id:docSnap.id,
            ...docSnap.data()
          });

        }
      );

      renderIncidents(list);

    }
  );

}


function renderIncidents(list){

  const box =
    document.getElementById(
      "incidentList"
    );

  box.innerHTML="";

  if(!list.length){

    box.innerHTML=
      `<div class="small">
        Keine aktiven Einsätze
       </div>`;

    return;

  }

  list.forEach(i=>{

    const card =
      document.createElement("div");

    card.className=
      "incident-card";

    card.innerHTML=`

      <b>🚨 ${i.keyword}</b>

      <div class="small">
        📍 ${i.address}
      </div>

      <div class="small">
        ${i.description || ""}
      </div>

      <div class="vehicle-buttons">

        <button
          onclick="focusIncident(
            '${i.id}',
            ${i.lat},
            ${i.lng}
          )">
          🗺 Karte
        </button>

        <button
          onclick="showReport(
            '${i.id}'
          )">
          📑 Bericht
        </button>

      </div>

    `;

    box.appendChild(card);

    addIncidentMarker(i);

  });

}


/* ==================================================
   18. EINSATZ MARKER
   ================================================== */

function addIncidentMarker(i){

  if(!map ||
     typeof i.lat!=="number")
    return;

  if(incidentMarkers[i.id]){

    incidentMarkers[i.id]
      .setLatLng([
        i.lat,
        i.lng
      ]);

    return;

  }

  const icon =
    L.divIcon({

      html:`

        <div style="
          width:42px;
          height:42px;
          border-radius:50%;
          background:#ff3b30;
          border:3px solid white;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:21px;
          box-shadow:0 0 18px #f00;
        ">
          🚨
        </div>

      `,

      iconSize:[42,42],
      iconAnchor:[21,21]

    });

  incidentMarkers[i.id] =
    L.marker(
      [i.lat,i.lng],
      {icon}
    )
    .addTo(map)
    .bindPopup(
      `<b>🚨 ${i.keyword}</b><br>
       ${i.address}`
    );

}


window.focusIncident=function(
  id,
  lat,
  lng
){

  map.setView(
    [lat,lng],
    16
  );

  if(incidentMarkers[id])
    incidentMarkers[id]
      .openPopup();

};


/* ==================================================
   19. EINSATZBERICHT
   ================================================== */

window.showReport=async function(id){

  const snapshot =
    await getDoc(
      doc(
        db,
        "servers",
        currentServer.id,
        "incidents",
        id
      )
    );

  if(!snapshot.exists())
    return;

  const i=snapshot.data();

  document.getElementById(
    "reportContent"
  ).innerHTML=`

    <div class="report">

      <h1>
        Einsatzbericht
      </h1>

      <div class="report-row">
        <b>Einsatznummer</b>
        <span>${id}</span>
      </div>

      <div class="report-row">
        <b>Stichwort</b>
        <span>${i.keyword}</span>
      </div>

      <div class="report-row">
        <b>Einsatzort</b>
        <span>${i.address}</span>
      </div>

      <div class="report-row">
        <b>Beschreibung</b>
        <span>${i.description || "-"}</span>
      </div>

      <div class="report-row">
        <b>Hinweise</b>
        <span>${i.notes || "-"}</span>
      </div>

      <div class="report-row">
        <b>Kräfte</b>
        <span>
          ${(i.resources || []).join(", ")}
        </span>
      </div>

      <div class="report-row">
        <b>Erstellt von</b>
        <span>${i.createdByName || "-"}</span>
      </div>

    </div>

  `;

  document.getElementById(
    "reportDialog"
  ).style.display="flex";

};


/* ==================================================
   20. SPIELER LIVE
   ================================================== */

function listenToPlayers(){

  const playersRef =
    ref(
      realtime,
      "servers/"+
      currentServer.id+
      "/players"
    );

  const myRef =
    ref(
      realtime,
      "servers/"+
      currentServer.id+
      "/players/"+
      currentUser.uid
    );

  set(
    myRef,
    {
      name:
        currentUser.displayName ||
        currentUser.email,
      online:true,
      joinedAt:Date.now()
    }
  );

  onDisconnect(myRef)
    .remove();

  onValue(
    playersRef,
    snapshot=>{

      const data =
        snapshot.val() || {};

      const list =
        document.getElementById(
          "playerList"
        );

      list.innerHTML="";

      Object.values(data)
        .forEach(player=>{

          const div =
            document.createElement("div");

          div.className=
            "player-card";

          div.innerHTML=
            "🟢 "+
            escapeHtml(
              player.name
            );

          list.appendChild(div);

        });

    }
  );

}


/* ==================================================
   21. MELDER
   ================================================== */

window.testPager=function(){

  const audio =
    document.getElementById(
      "pagerSound"
    );

  document.getElementById(
    "pagerStatus"
  ).textContent=
    "🔴 PROBEALARM";

  audio.currentTime=0;

  audio.play()
    .catch(()=>{

      alert(
        "Der Browser blockiert den Sound. " +
        "Drücke zuerst irgendwo auf die Seite."
      );

    });

  setTimeout(
    ()=>{
      document.getElementById(
        "pagerStatus"
      ).textContent=
        "🟢 Bereit";
    },
    5000
  );

};


/* ==================================================
   22. MIKROFON
   ================================================== */

let microphoneStream=null;

window.enableMicrophone=
async function(){

  try{

    microphoneStream =
      await navigator.mediaDevices
      .getUserMedia({
        audio:true
      });

    document.getElementById(
      "micStatus"
    ).textContent=
      "🟢 Mikrofon aktiviert";

  }
  catch(error){

    document.getElementById(
      "micStatus"
    ).textContent=
      "🔴 Mikrofonzugriff verweigert";

  }

};


/* ==================================================
   23. PUSH TO TALK
   ================================================== */

const ptt =
  document.getElementById(
    "pttButton"
  );

ptt.addEventListener(
  "mousedown",
  ()=>{
    ptt.classList.add("active");
    ptt.textContent=
      "🔴 SENDEN...";
  }
);

ptt.addEventListener(
  "mouseup",
  ()=>{
    ptt.classList.remove("active");
    ptt.textContent=
      "🎙 FUNK";
  }
);


/* ==================================================
   24. MODALS
   ================================================== */

window.closeModal=function(id){

  document.getElementById(id)
    .style.display="none";

};


/* ==================================================
   25. HTML SICHER AUSGEBEN
   ================================================== */

function escapeHtml(text){

  return String(text)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}
