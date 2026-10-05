import {
  initializeApp
} from
"https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from
"https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from
"https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
  getDatabase,
  ref,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  push
} from
"https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";


/* =====================================================
   FIREBASE CONFIG
=====================================================

   HIER DEINE DATEN EINTRAGEN.

===================================================== */

const firebaseConfig = {

  apiKey:
    "DEINE_API_KEY",

  authDomain:
    "DEIN-PROJEKT.firebaseapp.com",

  projectId:
    "DEIN-PROJEKT",

  storageBucket:
    "DEIN-PROJEKT.firebasestorage.app",

  messagingSenderId:
    "DEINE_SENDER_ID",

  appId:
    "DEINE_APP_ID",

  databaseURL:
    "DEINE_DATABASE_URL"

};


/* =====================================================
   FIREBASE
===================================================== */

const firebaseApp =
  initializeApp(firebaseConfig);

const auth =
  getAuth(firebaseApp);

const db =
  getFirestore(firebaseApp);

const realtime =
  getDatabase(firebaseApp);


/* =====================================================
   VARIABLES
===================================================== */

let currentUser = null;

let currentServer = null;

let map = null;

let vehicles = {};

let incidents = {};

let vehicleMarkers = {};

let incidentMarkers = {};

let unsubscribeIncidents = null;

let unsubscribeServer = null;

let microphoneStream = null;

let peerConnections = {};

let localVoiceChannel = null;

let audioContext = null;

let voiceProcessor = null;


/* =====================================================
   LOGIN
===================================================== */

window.showLogin = function () {

  document.getElementById(
    "loginForm"
  ).style.display = "block";

  document.getElementById(
    "registerForm"
  ).style.display = "none";

  document.getElementById(
    "loginTab"
  ).classList.add("active");

  document.getElementById(
    "registerTab"
  ).classList.remove("active");

};


window.showRegister = function () {

  document.getElementById(
    "loginForm"
  ).style.display = "none";

  document.getElementById(
    "registerForm"
  ).style.display = "block";

  document.getElementById(
    "loginTab"
  ).classList.remove("active");

  document.getElementById(
    "registerTab"
  ).classList.add("active");

};


/* =====================================================
   REGISTER
===================================================== */

window.registerUser =
async function () {

  const name =
    document.getElementById(
      "registerName"
    ).value.trim();

  const email =
    document.getElementById(
      "registerEmail"
    ).value.trim();

  const password =
    document.getElementById(
      "registerPassword"
    ).value;


  if (!name ||
      !email ||
      !password) {

    showAuthMessage(
      "Bitte alle Felder ausfüllen."
    );

    return;

  }


  if (password.length < 6) {

    showAuthMessage(
      "Das Passwort muss mindestens 6 Zeichen haben."
    );

    return;

  }


  try {

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );


    await updateProfile(
      credential.user,
      {
        displayName: name
      }
    );


    await setDoc(
      doc(
        db,
        "users",
        credential.user.uid
      ),
      {

        displayName:
          name,

        email:
          email,

        createdAt:
          serverTimestamp()

      }
    );


  }
  catch (error) {

    showAuthMessage(
      firebaseError(error)
    );

  }

};


/* =====================================================
   LOGIN
===================================================== */

window.loginUser =
async function () {

  const email =
    document.getElementById(
      "loginEmail"
    ).value.trim();

  const password =
    document.getElementById(
      "loginPassword"
    ).value;


  try {

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

  }
  catch (error) {

    showAuthMessage(
      firebaseError(error)
    );

  }

};


/* =====================================================
   LOGOUT
===================================================== */

window.logoutUser =
async function () {

  if (
    currentServer &&
    currentUser
  ) {

    await remove(
      ref(
        realtime,
        `servers/${currentServer.id}/players/${currentUser.uid}`
      )
    );

  }


  await signOut(auth);

};


/* =====================================================
   AUTH STATE
===================================================== */

onAuthStateChanged(
  auth,
  async user => {

    if (user) {

      currentUser = user;

      document.getElementById(
        "loginScreen"
      ).style.display = "none";

      document.getElementById(
        "game"
      ).style.display = "block";


      document.getElementById(
        "accountName"
      ).textContent =
        user.displayName ||
        user.email;


      initializeMap();

      await loadMyServers();

      startPresence();

      updateConnection(
        true
      );


    }
    else {

      currentUser = null;

      document.getElementById(
        "loginScreen"
      ).style.display = "flex";

      document.getElementById(
        "game"
      ).style.display = "none";

      updateConnection(
        false
      );

    }

  }
);


/* =====================================================
   MAP
===================================================== */

function initializeMap() {

  if (map)
    return;


  map =
    L.map(
      "map"
    ).setView(
      [
        49.4521,
        11.0767
      ],
      13
    );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {

      maxZoom: 19,

      attribution:
        "© OpenStreetMap contributors"

    }
  ).addTo(map);

}


/* =====================================================
   SERVER DIALOG
===================================================== */

window.openServerDialog =
function () {

  document.getElementById(
    "serverDialog"
  ).style.display = "flex";

  loadMyServers();

};


window.openVehicleDialog =
function () {

  if (!currentServer) {

    alert(
      "Bitte zuerst einen Server erstellen oder beitreten."
    );

    return;

  }


  document.getElementById(
    "vehicleDialog"
  ).style.display = "flex";

};


window.openIncidentDialog =
function () {

  if (!currentServer) {

    alert(
      "Bitte zuerst einen Server erstellen oder beitreten."
    );

    return;

  }


  document.getElementById(
    "incidentDialog"
  ).style.display = "flex";

};


/* =====================================================
   SERVER ERSTELLEN
===================================================== */

window.createServer =
async function () {

  const name =
    document.getElementById(
      "newServerName"
    ).value.trim();


  if (!name) {

    alert(
      "Bitte einen Servernamen eingeben."
    );

    return;

  }


  const code =
    createServerCode();


  const serverRef =
    doc(
      collection(
        db,
        "servers"
      )
    );


  await setDoc(
    serverRef,
    {

      name:
        name,

      code:
        code,

      ownerId:
        currentUser.uid,

      members: {

        [currentUser.uid]:
          true

      },

      createdAt:
        serverTimestamp()

    }
  );


  await setDoc(
    doc(
      db,
      "servers",
      serverRef.id,
      "members",
      currentUser.uid
    ),
    {

      uid:
        currentUser.uid,

      name:
        currentUser.displayName ||
        currentUser.email,

      joinedAt:
        serverTimestamp()

    }
  );


  await joinServer(
    code
  );


  alert(
    `Server erstellt!\n\nServer-Code:\n${code}`
  );

};


/* =====================================================
   SERVER CODE
===================================================== */

function createServerCode() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let result =
    "ILS-";


  for (
    let i = 0;
    i < 6;
    i++
  ) {

    result +=
      chars[
        Math.floor(
          Math.random() *
          chars.length
        )
      ];

  }


  return result;

}


/* =====================================================
   SERVER BEITRETEN
===================================================== */

window.joinServer =
async function (
  directCode = null
) {

  const inputCode =
    directCode ||
    document.getElementById(
      "joinServerCode"
    ).value.trim().toUpperCase();


  if (!inputCode) {

    alert(
      "Bitte einen Server-Code eingeben."
    );

    return;

  }


  const q =
    query(
      collection(
        db,
        "servers"
      ),
      where(
        "code",
        "==",
        inputCode
      )
    );


  const snapshot =
    await getDocs(q);


  if (
    snapshot.empty
  ) {

    alert(
      "Server nicht gefunden."
    );

    return;

  }


  const serverDoc =
    snapshot.docs[0];


  const server =
    serverDoc.data();


  await updateDoc(
    doc(
      db,
      "servers",
      serverDoc.id
    ),
    {

      [`members.${currentUser.uid}`]:
        true

    }
  );


  await setDoc(
    doc(
      db,
      "servers",
      serverDoc.id,
      "members",
      currentUser.uid
    ),
    {

      uid:
        currentUser.uid,

      name:
        currentUser.displayName ||
        currentUser.email,

      joinedAt:
        serverTimestamp()

    }
  );


  await enterServer(
    serverDoc.id,
    server
  );

};


/* =====================================================
   SERVER BETRETEN
===================================================== */

async function enterServer(
  serverId,
  server
) {

  currentServer = {

    id:
      serverId,

    ...server

  };


  localStorage.setItem(
    "currentServer",
    serverId
  );


  localStorage.setItem(
    "currentServerCode",
    server.code
  );


  document.getElementById(
    "serverName"
  ).textContent =
    server.name;


  document.getElementById(
    "serverCode"
  ).textContent =
    `(${server.code})`;


  closeModal(
    "serverDialog"
  );


  listenToServer();

  listenToVehicles();

  listenToIncidents();

  listenToPlayers();

  initializeVoiceSystem();

}


/* =====================================================
   MEINE SERVER
===================================================== */

async function loadMyServers() {

  if (!currentUser)
    return;


  const q =
    query(
      collection(
        db,
        "servers"
      ),
      where(
        `members.${currentUser.uid}`,
        "==",
        true
      )
    );


  const snapshot =
    await getDocs(q);


  const box =
    document.getElementById(
      "myServers"
    );


  box.innerHTML = "";


  if (
    snapshot.empty
  ) {

    box.innerHTML =
      `<div class="small">
        Noch keine Server.
      </div>`;

    return;

  }


  snapshot.forEach(
    serverDoc => {

      const data =
        serverDoc.data();


      const button =
        document.createElement(
          "button"
        );


      button.className =
        "wide-button";


      button.textContent =
        `${data.name} – ${data.code}`;


      button.onclick =
        () =>
          enterServer(
            serverDoc.id,
            data
          );


      box.appendChild(
        button
      );

    }
  );

}


/* =====================================================
   LIVE SERVER
===================================================== */

function listenToServer() {

  if (
    unsubscribeServer
  ) {

    unsubscribeServer();

  }


  unsubscribeServer =
    onSnapshot(
      doc(
        db,
        "servers",
        currentServer.id
      ),
      snapshot => {

        if (!snapshot.exists())
          return;


        currentServer = {

          id:
            snapshot.id,

          ...snapshot.data()

        };


        document.getElementById(
          "serverName"
        ).textContent =
          currentServer.name;


        document.getElementById(
          "serverCode"
        ).textContent =
          `(${currentServer.code})`;

      }
    );

}


/* =====================================================
   FAHRZEUGE
===================================================== */

function listenToVehicles() {

  if (!currentServer)
    return;


  const vehicleRef =
    ref(
      realtime,
      `servers/${currentServer.id}/vehicles`
    );


  onValue(
    vehicleRef,
    snapshot => {

      vehicles =
        snapshot.val() || {};


      renderVehicles();

    }
  );

}


/* =====================================================
   FAHRZEUG ERSTELLEN
===================================================== */

window.createVehicle =
async function () {

  const name =
    document.getElementById(
      "vehicleName"
    ).value.trim();


  const type =
    document.getElementById(
      "vehicleType"
    ).value;


  const maxCrew =
    Number(
      document.getElementById(
        "vehicleMaxCrew"
      ).value
    );


  if (!name) {

    alert(
      "Bitte Fahrzeugnamen eingeben."
    );

    return;

  }


  const vehicleId =
    push(
      ref(
        realtime,
        `servers/${currentServer.id}/vehicles`
      )
    ).key;


  const icons = {

    Feuerwehr:
      "🚒",

    Rettungsdienst:
      "🚑",

    Polizei:
      "🚓",

    THW:
      "🚧"

  };


  const vehicle = {

    id:
      vehicleId,

    name:
      name,

    type:
      type,

    icon:
      icons[type] || "🚨",

    maxCrew:
      maxCrew || 3,

    status:
      "ready",

    lat:
      49.4521,

    lng:
      11.0767,

    crew:
      {},

    createdBy:
      currentUser.uid

  };


  await set(
    ref(
      realtime,
      `servers/${currentServer.id}/vehicles/${vehicleId}`
    ),
    vehicle
  );


  closeModal(
    "vehicleDialog"
  );


  document.getElementById(
    "vehicleName"
  ).value = "";

};


/* =====================================================
   FAHRZEUGE RENDERN
===================================================== */

function renderVehicles() {

  const list =
    document.getElementById(
      "vehicleList"
    );


  list.innerHTML = "";


  const entries =
    Object.entries(
      vehicles
    );


  if (!entries.length) {

    list.innerHTML =
      `<div class="small">
        Keine Fahrzeuge vorhanden.
      </div>`;

    return;

  }


  entries.forEach(
    ([id, vehicle]) => {

      const crew =
        vehicle.crew
          ? Object.keys(
              vehicle.crew
            ).length
          : 0;


      const card =
        document.createElement(
          "div"
        );


      card.className =
        "vehicle-card";


      card.innerHTML = `

        <div class="vehicle-name">
          ${vehicle.icon}
          ${escapeHtml(vehicle.name)}
        </div>

        <div class="small">
          ${escapeHtml(vehicle.type)}
        </div>

        <div class="status ${vehicle.status}">
          ${statusText(vehicle.status)}
        </div>

        <div class="small">
          👥 ${crew}/${vehicle.maxCrew}
        </div>

        <div class="vehicle-buttons">

          <button
            onclick="takeSeat('${id}')"
          >
            👤 Einsteigen
          </button>

          <button
            onclick="showVehicle('${id}')"
          >
            ℹ️ Info
          </button>

        </div>

      `;


      list.appendChild(
        card
      );


      updateVehicleMarker(
        id,
        vehicle
      );

    }
  );

}


/* =====================================================
   STATUS
===================================================== */

function statusText(
  status
) {

  const values = {

    ready:
      "🟢 Einsatzbereit",

    alarm:
      "🔴 Alarmiert",

    enroute:
      "🟡 Auf Anfahrt",

    busy:
      "🔴 Im Einsatz",

    available:
      "🟢 Verfügbar"

  };


  return (
    values[status] ||
    "⚫ Unbekannt"
  );

}


/* =====================================================
   FAHRZEUG MARKER
===================================================== */

function updateVehicleMarker(
  id,
  vehicle
) {

  if (!map)
    return;


  const position = [

    Number(
      vehicle.lat
    ),

    Number(
      vehicle.lng
    )

  ];


  if (
    vehicleMarkers[id]
  ) {

    vehicleMarkers[id]
      .setLatLng(
        position
      );

    return;

  }


  const icon =
    L.divIcon({

      html: `

        <div style="
          width:42px;
          height:42px;
          border-radius:50%;
          background:#1687ff;
          border:3px solid white;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:21px;
          box-shadow:0 2px 12px #000;
        ">

          ${vehicle.icon}

        </div>

      `,

      iconSize:
        [42,42],

      iconAnchor:
        [21,21]

    });


  vehicleMarkers[id] =
    L.marker(
      position,
      {
        icon
      }
    )
    .addTo(map)
    .bindPopup(
      `<b>
        ${escapeHtml(vehicle.name)}
       </b>`
    );

}


/* =====================================================
   FAHRZEUG BESATZEN
===================================================== */

window.takeSeat =
async function (
  vehicleId
) {

  const vehicle =
    vehicles[vehicleId];


  if (!vehicle)
    return;


  const crew =
    vehicle.crew || {};


  if (
    crew[currentUser.uid]
  ) {

    await remove(
      ref(
        realtime,
        `servers/${currentServer.id}/vehicles/${vehicleId}/crew/${currentUser.uid}`
      )
    );

    return;

  }


  const currentCrew =
    Object.keys(
      crew
    ).length;


  if (
    currentCrew >=
    Number(
      vehicle.maxCrew
    )
  ) {

    alert(
      "Das Fahrzeug ist voll."
    );

    return;

  }


  await set(
    ref(
      realtime,
      `servers/${currentServer.id}/vehicles/${vehicleId}/crew/${currentUser.uid}`
    ),
    {

      uid:
        currentUser.uid,

      name:
        currentUser.displayName ||
        currentUser.email,

      joinedAt:
        Date.now()

    }
  );


  const ownSeatRef =
    ref(
      realtime,
      `servers/${currentServer.id}/vehicles/${vehicleId}/crew/${currentUser.uid}`
    );


  onDisconnect(
    ownSeatRef
  ).remove();

};


/* =====================================================
   FAHRZEUG INFO
===================================================== */

window.showVehicle =
function (
  vehicleId
) {

  const vehicle =
    vehicles[vehicleId];


  if (!vehicle)
    return;


  const crew =
    vehicle.crew || {};


  let crewHtml =
    "";


  Object.values(
    crew
  ).forEach(
    player => {

      crewHtml += `
        <div class="player-card">
          👤 ${escapeHtml(player.name)}
        </div>
      `;

    }
  );


  if (!crewHtml) {

    crewHtml =
      `<div class="small">
        Noch keine Besatzung.
      </div>`;

  }


  document.getElementById(
    "vehicleDetail"
  ).innerHTML = `

    <h2>
      ${vehicle.icon}
      ${escapeHtml(vehicle.name)}
    </h2>

    <p>
      <b>Typ:</b>
      ${escapeHtml(vehicle.type)}
    </p>

    <p>
      <b>Status:</b>
      ${statusText(vehicle.status)}
    </p>

    <h3>
      Besatzung
    </h3>

    ${crewHtml}

    <button
      class="wide-button"
      onclick="moveSelectedVehicle('${vehicleId}')"
    >
      📍 Fahrzeug bewegen
    </button>

  `;


  document.getElementById(
    "vehicleDetailDialog"
  ).style.display =
    "flex";

};


/* =====================================================
   FAHRZEUG BEWEGEN
===================================================== */

window.moveSelectedVehicle =
function (
  vehicleId
) {

  if (!map)
    return;


  alert(
    "Klicke jetzt auf die Karte, um das Fahrzeug dort zu bewegen."
  );


  map.once(
    "click",
    async event => {

      await update(
        ref(
          realtime,
          `servers/${currentServer.id}/vehicles/${vehicleId}`
        ),
        {

          lat:
            event.latlng.lat,

          lng:
            event.latlng.lng

        }
      );

    }
  );

};


/* =====================================================
   EINSATZ ERSTELLEN
===================================================== */

window.createIncident =
async function () {

  const street =
    document.getElementById(
      "incidentStreet"
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
    ).value.trim();


  const notes =
    document.getElementById(
      "incidentNotes"
    ).value.trim();


  if (!street) {

    alert(
      "Bitte eine Straße eingeben."
    );

    return;

  }


  const resources =
    Array.from(
      document.querySelectorAll(
        ".resource:checked"
      )
    ).map(
      checkbox =>
        checkbox.value
    );


  /*
   * Für die Demo wird die Einsatzstelle
   * in der Umgebung von Nürnberg erzeugt.
   */

  const lat =
    49.4521 +
    (
      Math.random() -
      0.5
    ) *
    0.04;


  const lng =
    11.0767 +
    (
      Math.random() -
      0.5
    ) *
    0.05;


  const incident = {

    keyword:
      keyword,

    address:
      `${street}, ${city}`,

    city:
      city,

    description:
      description,

    notes:
      notes,

    resources:
      resources,

    status:
      "offen",

    lat:
      lat,

    lng:
      lng,

    createdBy:
      currentUser.uid,

    createdByName:
      currentUser.displayName ||
      currentUser.email,

    createdAt:
      serverTimestamp()

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


  playPager();


  document.getElementById(
    "incidentStreet"
  ).value = "";


  document.getElementById(
    "incidentDescription"
  ).value = "";


  document.getElementById(
    "incidentNotes"
  ).value = "";

};


/* =====================================================
   LIVE EINSÄTZE
===================================================== */

function listenToIncidents() {

  if (
    unsubscribeIncidents
  ) {

    unsubscribeIncidents();

  }


  const incidentsRef =
    collection(
      db,
      "servers",
      currentServer.id,
      "incidents"
    );


  unsubscribeIncidents =
    onSnapshot(
      incidentsRef,
      snapshot => {

        incidents = {};


        snapshot.forEach(
          item => {

            incidents[item.id] = {

              id:
                item.id,

              ...item.data()

            };

          }
        );


        renderIncidents();

      },
      error => {

        console.error(
          "Incident listener:",
          error
        );

      }
    );

}


/* =====================================================
   EINSÄTZE RENDERN
===================================================== */

function renderIncidents() {

  const list =
    document.getElementById(
      "incidentList"
    );


  list.innerHTML = "";


  const values =
    Object.values(
      incidents
    );


  if (!values.length) {

    list.innerHTML =
      `<div class="small">
        Keine Einsätze.
      </div>`;

    return;

  }


  values.forEach(
    incident => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "incident-card";


      card.innerHTML = `

        <b>
          🚨 ${escapeHtml(
            incident.keyword
          )}
        </b>

        <div class="small">
          📍 ${escapeHtml(
            incident.address
          )}
        </div>

        <div class="small">
          ${escapeHtml(
            incident.description ||
            ""
          )}
        </div>

        <div class="vehicle-buttons">

          <button
            onclick="
              focusIncident(
                '${incident.id}'
              )
            "
          >
            🗺 Karte
          </button>

          <button
            onclick="
              showReport(
                '${incident.id}'
              )
            "
          >
            📋 Bericht
          </button>

        </div>

      `;


      list.appendChild(
        card
      );


      updateIncidentMarker(
        incident
      );

    }
  );

}


/* =====================================================
   EINSATZ MARKER
===================================================== */

function updateIncidentMarker(
  incident
) {

  if (!map)
    return;


  const position = [

    Number(
      incident.lat
    ),

    Number(
      incident.lng
    )

  ];


  if (
    incidentMarkers[
      incident.id
    ]
  ) {

    incidentMarkers[
      incident.id
    ].setLatLng(
      position
    );

    return;

  }


  const icon =
    L.divIcon({

      html: `

        <div style="
          width:44px;
          height:44px;
          border-radius:50%;
          background:#ff3b30;
          border:3px solid white;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:22px;
          box-shadow:0 0 20px #f00;
        ">
          🚨
        </div>

      `,

      iconSize:
        [44,44],

      iconAnchor:
        [22,22]

    });


  incidentMarkers[
    incident.id
  ] =
    L.marker(
      position,
      {
        icon
      }
    )
    .addTo(map)
    .bindPopup(
      `<b>
        🚨 ${escapeHtml(
          incident.keyword
        )}
       </b>
       <br>
       ${escapeHtml(
         incident.address
       )}`
    );

}


/* =====================================================
   EINSATZ FOKUS
===================================================== */

window.focusIncident =
function (
  incidentId
) {

  const incident =
    incidents[
      incidentId
    ];


  if (!incident)
    return;


  map.setView(
    [
      incident.lat,
      incident.lng
    ],
    16
  );


  if (
    incidentMarkers[
      incidentId
    ]
  ) {

    incidentMarkers[
      incidentId
    ].openPopup();

  }

};


/* =====================================================
   EINSATZBERICHT
===================================================== */

window.showReport =
function (
  incidentId
) {

  const incident =
    incidents[
      incidentId
    ];


  if (!incident)
    return;


  document.getElementById(
    "reportContent"
  ).innerHTML = `

    <div class="report">

      <h1>
        Einsatzbericht
      </h1>

      <div class="report-row">

        <b>
          Einsatznummer
        </b>

        <span>
          ${incidentId}
        </span>

      </div>


      <div class="report-row">

        <b>
          Einsatzstichwort
        </b>

        <span>
          ${escapeHtml(
            incident.keyword
          )}
        </span>

      </div>


      <div class="report-row">

        <b>
          Einsatzort
        </b>

        <span>
          ${escapeHtml(
            incident.address
          )}
        </span>

      </div>


      <div class="report-row">

        <b>
          Beschreibung
        </b>

        <span>
          ${escapeHtml(
            incident.description ||
            "-"
          )}
        </span>

      </div>


      <div class="report-row">

        <b>
          Hinweise
        </b>

        <span>
          ${escapeHtml(
            incident.notes ||
            "-"
          )}
        </span>

      </div>


      <div class="report-row">

        <b>
          Einsatzmittel
        </b>

        <span>
          ${(
            incident.resources ||
            []
          ).join(", ")}
        </span>

      </div>


      <div class="report-row">

        <b>
          Erstellt von
        </b>

        <span>
          ${escapeHtml(
            incident.createdByName ||
            "-"
          )}
        </span>

      </div>


      <div class="report-row">

        <b>
          Status
        </b>

        <span>
          ${escapeHtml(
            incident.status ||
            "-"
          )}
        </span>

      </div>

    </div>

  `;


  document.getElementById(
    "reportDialog"
  ).style.display =
    "flex";

};


/* =====================================================
   SPIELER PRESENCE
===================================================== */

function startPresence() {

  if (!currentUser)
    return;


  const statusRef =
    ref(
      realtime,
      `users/${currentUser.uid}/online`
    );


  set(
    statusRef,
    true
  );


  onDisconnect(
    statusRef
  ).set(false);

}


/* =====================================================
   LIVE SPIELER
===================================================== */

function listenToPlayers() {

  if (!currentServer)
    return;


  const playersRef =
    ref(
      realtime,
      `servers/${currentServer.id}/players`
    );


  const myPlayerRef =
    ref(
      realtime,
      `servers/${currentServer.id}/players/${currentUser.uid}`
    );


  set(
    myPlayerRef,
    {

      uid:
        currentUser.uid,

      name:
        currentUser.displayName ||
        currentUser.email,

      online:
        true,

      joinedAt:
        Date.now()

    }
  );


  onDisconnect(
    myPlayerRef
  ).remove();


  onValue(
    playersRef,
    snapshot => {

      const players =
        snapshot.val() || {};


      const list =
        document.getElementById(
          "playerList"
        );


      list.innerHTML = "";


      Object.values(
        players
      ).forEach(
        player => {

          const div =
            document.createElement(
              "div"
            );


          div.className =
            "player-card";


          div.innerHTML =
            `🟢 ${escapeHtml(
              player.name
            )}`;


          list.appendChild(
            div
          );

        }
      );

    }
  );

}


/* =====================================================
   MELDER
===================================================== */

window.testPager =
function () {

  playPager();

};


function playPager() {

  const audio =
    document.getElementById(
      "pagerSound"
    );


  document.getElementById(
    "pagerStatus"
  ).textContent =
    "🔴 ALARM";


  audio.currentTime = 0;


  audio.play()
    .catch(
      () => {

        console.log(
          "Browser wartet auf Benutzerinteraktion."
        );

      }
    );


  setTimeout(
    () => {

      document.getElementById(
        "pagerStatus"
      ).textContent =
        "🟢 Einsatzbereit";

    },
    5000
  );

}


/* =====================================================
   ALARM QUITTIEREN
===================================================== */

window.acknowledgeAlarm =
function () {

  document.getElementById(
    "alarmOverlay"
  ).style.display =
    "none";

};


/* =====================================================
   MIKROFON
===================================================== */

window.enableMicrophone =
async function () {

  try {

    microphoneStream =
      await navigator.mediaDevices
        .getUserMedia(
          {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          }
        );


    document.getElementById(
      "micStatus"
    ).textContent =
      "🟢 Mikrofon aktiviert";


    document.getElementById(
      "voiceStatus"
    ).textContent =
      "🟢 Funk bereit";


  }
  catch (error) {

    console.error(
      error
    );


    document.getElementById(
      "micStatus"
    ).textContent =
      "🔴 Mikrofonzugriff verweigert";

  }

};


/* =====================================================
   FUNK NACHRICHT
===================================================== */

window.sendRadioMessage =
async function () {

  if (!currentServer)
    return;


  const input =
    document.getElementById(
      "radioText"
    );


  const text =
    input.value.trim();


  if (!text)
    return;


  const channel =
    document.getElementById(
      "radioChannel"
    ).value;


  const messageRef =
    push(
      ref(
        realtime,
        `servers/${currentServer.id}/radio/${channel}`
      )
    );


  await set(
    messageRef,
    {

      uid:
        currentUser.uid,

      name:
        currentUser.displayName ||
        currentUser.email,

      text:
        text,

      time:
        Date.now()

    }
  );


  input.value = "";

};


/* =====================================================
   LIVE FUNK NACHRICHTEN
===================================================== */

function listenToRadio() {

  if (!currentServer)
    return;


  const channel =
    document.getElementById(
      "radioChannel"
    ).value;


  const radioRef =
    ref(
      realtime,
      `servers/${currentServer.id}/radio/${channel}`
    );


  onValue(
    radioRef,
    snapshot => {

      const messages =
        snapshot.val() || {};


      const box =
        document.getElementById(
          "radioMessages"
        );


      box.innerHTML = "";


      Object.values(
        messages
      )
      .sort(
        (a,b) =>
          a.time -
          b.time
      )
      .slice(-50)
      .forEach(
        message => {

          const div =
            document.createElement(
              "div"
            );


          div.className =
            "radio-message";


          div.innerHTML = `

            <b>
              ${escapeHtml(
                message.name
              )}
            </b>

            <br>

            ${escapeHtml(
              message.text
            )}

          `;


          box.appendChild(
            div
          );


          box.scrollTop =
            box.scrollHeight;

        }
      );

    }
  );

}


/* =====================================================
   FUNK KANAL WECHSEL
===================================================== */

document.addEventListener(
  "change",
  event => {

    if (
      event.target.id ===
      "radioChannel"
    ) {

      listenToRadio();

    }

  }
);


/* =====================================================
   WEBRTC FUNK
=====================================================

   Dieser Teil stellt die Audio-Grundlage bereit.
   Die Verbindung zwischen mehreren Spielern wird
   über Firebase signalisiert.

===================================================== */

function initializeVoiceSystem() {

  if (!currentServer)
    return;


  listenToVoiceSignals();

}


/* =====================================================
   VOICE SIGNALS
===================================================== */

function listenToVoiceSignals() {

  const signalsRef =
    ref(
      realtime,
      `servers/${currentServer.id}/voiceSignals/${currentUser.uid}`
    );


  onValue(
    signalsRef,
    snapshot => {

      const data =
        snapshot.val();


      if (!data)
        return;


      Object.entries(
        data
      ).forEach(
        async ([signalId, signal]) => {

          await handleVoiceSignal(
            signalId,
            signal
          );

        }
      );

    }
  );

}


/* =====================================================
   HANDLE SIGNAL
===================================================== */

async function handleVoiceSignal(
  signalId,
  signal
) {

  if (
    signal.to !==
    currentUser.uid
  )
    return;


  try {

    /*
     * Die eigentliche PeerConnection wird
     * hier vorbereitet.
     */

    if (
      signal.type ===
      "offer"
    ) {

      const peer =
        createPeerConnection(
          signal.from
        );


      await peer.setRemoteDescription(
        signal.description
      );


      const answer =
        await peer.createAnswer();


      await peer.setLocalDescription(
        answer
      );


      await sendVoiceSignal(
        signal.from,
        {

          type:
            "answer",

          description:
            peer.localDescription,

          from:
            currentUser.uid,

          to:
            signal.from

        }
      );

    }


    if (
      signal.type ===
      "answer"
    ) {

      const peer =
        peerConnections[
          signal.from
        ];


      if (peer) {

        await peer.setRemoteDescription(
          signal.description
        );

      }

    }


    if (
      signal.type ===
      "candidate"
    ) {

      const peer =
        peerConnections[
          signal.from
        ];


      if (peer) {

        await peer.addIceCandidate(
          signal.candidate
        );

      }

    }

  }
  catch (error) {

    console.error(
      "Voice signal error:",
      error
    );

  }

}


/* =====================================================
   PEER CONNECTION
===================================================== */

function createPeerConnection(
  remoteUid
) {

  if (
    peerConnections[
      remoteUid
    ]
  ) {

    return peerConnections[
      remoteUid
    ];

  }


  const peer =
    new RTCPeerConnection({

      iceServers: [

        {
          urls:
            "stun:stun.l.google.com:19302"
        },

        {
          urls:
            "stun:stun1.l.google.com:19302"
        }

      ]

    });


  peerConnections[
    remoteUid
  ] = peer;


  if (
    microphoneStream
  ) {

    microphoneStream
      .getTracks()
      .forEach(
        track => {

          peer.addTrack(
            track,
            microphoneStream
          );

        }
      );

  }


  peer.onicecandidate =
    async event => {

      if (
        event.candidate
      ) {

        await sendVoiceSignal(
          remoteUid,
          {

            type:
              "candidate",

            candidate:
              event.candidate,

            from:
              currentUser.uid,

            to:
              remoteUid

          }
        );

      }

    };


  peer.ontrack =
    event => {

      const audio =
        document.createElement(
          "audio"
        );


      audio.autoplay = true;

      audio.srcObject =
        event.streams[0];

      audio.dataset.voiceUser =
        remoteUid;

      document.body.appendChild(
        audio
      );

    };


  return peer;

}


/* =====================================================
   SEND VOICE SIGNAL
===================================================== */

async function sendVoiceSignal(
  targetUid,
  signal
) {

  const signalRef =
    push(
      ref(
        realtime,
        `servers/${currentServer.id}/voiceSignals/${targetUid}`
      )
    );


  await set(
    signalRef,
    signal
  );

}


/* =====================================================
   PUSH TO TALK
===================================================== */

const pttButton =
  document.getElementById(
    "pttButton"
  );


pttButton.addEventListener(
  "mousedown",
  startPTT
);


pttButton.addEventListener(
  "mouseup",
  stopPTT
);


pttButton.addEventListener(
  "mouseleave",
  stopPTT
);


async function startPTT() {

  if (
    !microphoneStream
  ) {

    await enableMicrophone();

  }


  if (
    !microphoneStream
  )
    return;


  microphoneStream
    .getAudioTracks()
    .forEach(
      track => {

        track.enabled =
          true;

      }
    );


  pttButton.classList.add(
    "active"
  );


  pttButton.textContent =
    "🔴 SENDEN...";


  document.getElementById(
    "voiceStatus"
  ).textContent =
    "🔴 FUNK SENDEN";

}


function stopPTT() {

  if (
    !microphoneStream
  )
    return;


  microphoneStream
    .getAudioTracks()
    .forEach(
      track => {

        track.enabled =
          false;

      }
    );


  pttButton.classList.remove(
    "active"
  );


  pttButton.textContent =
    "🎙 PUSH TO TALK";


  document.getElementById(
    "voiceStatus"
  ).textContent =
    "🟢 Funk bereit";

}


/* =====================================================
   THEME
===================================================== */

window.toggleTheme =
function () {

  document.body.classList.toggle(
    "light"
  );


  localStorage.setItem(
    "theme",
    document.body.classList.contains(
      "light"
    )
      ? "light"
      : "dark"
  );

};


if (
  localStorage.getItem(
    "theme"
  ) ===
  "light"
) {

  document.body.classList.add(
    "light"
  );

}


/* =====================================================
   MODAL
===================================================== */

window.closeModal =
function (
  id
) {

  document.getElementById(
    id
  ).style.display =
    "none";

};


/* =====================================================
   CONNECTION
===================================================== */

function updateConnection(
  connected
) {

  document.getElementById(
    "connectionDot"
  ).textContent =
    connected
      ? "🟢"
      : "🔴";


  document.getElementById(
    "connectionText"
  ).textContent =
    connected
      ? "Verbunden"
      : "Offline";

}


window.addEventListener(
  "online",
  () =>
    updateConnection(
      true
    )
);


window.addEventListener(
  "offline",
  () =>
    updateConnection(
      false
    )
);


/* =====================================================
   FIREBASE FEHLER
===================================================== */

function showAuthMessage(
  text
) {

  document.getElementById(
    "authMessage"
  ).textContent =
    text;

}


function firebaseError(
  error
) {

  const errors = {

    "auth/invalid-credential":
      "E-Mail oder Passwort falsch.",

    "auth/email-already-in-use":
      "Diese E-Mail wird bereits verwendet.",

    "auth/invalid-email":
      "Ungültige E-Mail.",

    "auth/weak-password":
      "Das Passwort ist zu schwach.",

    "auth/too-many-requests":
      "Zu viele Versuche. Bitte später erneut versuchen."

  };


  return (
    errors[
      error.code
    ] ||
    `Firebase Fehler: ${error.code}`
  );

}


/* =====================================================
   HTML SICHERHEIT
===================================================== */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =====================================================
   AUTOMATISCHEN SERVER LADEN
===================================================== */

async function loadSavedServer() {

  const serverId =
    localStorage.getItem(
      "currentServer"
    );


  if (!serverId)
    return;


  const snapshot =
    await getDoc(
      doc(
        db,
        "servers",
        serverId
      )
    );


  if (
    snapshot.exists()
  ) {

    await enterServer(
      snapshot.id,
      snapshot.data()
    );

  }

}


/* =====================================================
   RADIO START
===================================================== */

setTimeout(
  () => {

    if (
      currentServer
    ) {

      listenToRadio();

    }

  },
  2000
);
