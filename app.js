import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  getDatabase,
  ref,
  onValue,
  set,
  push,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";


/* =========================================================
   FIREBASE CONFIG
   HIER DEINE FIREBASE DATEN EINTRAGEN
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDWD0EX3qY-JO-5TRRKO2UVaV3XXEkiFDk",
  authDomain: "ils-leitstellen-rp.firebaseapp.com",
  projectId: "ils-leitstellen-rp",
  storageBucket: "ils-leitstellen-rp.firebasestorage.app",
  messagingSenderId: "1052245341584",
  appId: "1:1052245341584:web:25bbbbc7aeb910eb7e6f15",
  measurementId: "G-EDG6QHJ1PN"
};



/* =========================================================
   FIREBASE START
   ========================================================= */

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);

const realtimeDB = getDatabase(firebaseApp);

const storage = getStorage(firebaseApp);


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentUser = null;

let currentServer = null;

let currentServerId = null;

let vehicles = [];

let operations = [];

let players = [];

let reports = [];

let radioMessages = [];

let unsubscribeFunctions = [];

let map;

let vehicleMarkers = {};

let operationMarkers = {};

let isRegisterMode = false;

let microphoneStream = null;


/* =========================================================
   DOM
   ========================================================= */

const $ = id => document.getElementById(id);


/* =========================================================
   AUTH UI
   ========================================================= */

$("loginTab").onclick = () => {

  isRegisterMode = false;

  $("loginTab").classList.add("active");

  $("registerTab").classList.remove("active");

  $("displayName").classList.add("hidden");

  $("authButton").textContent = "ANMELDEN";

};


$("registerTab").onclick = () => {

  isRegisterMode = true;

  $("registerTab").classList.add("active");

  $("loginTab").classList.remove("active");

  $("displayName").classList.remove("hidden");

  $("authButton").textContent = "KONTO ERSTELLEN";

};


/* =========================================================
   AUTH
   ========================================================= */

$("authForm").addEventListener("submit", async event => {

  event.preventDefault();

  const email = $("email").value.trim();

  const password = $("password").value;

  const displayName =
    $("displayName").value.trim() || "Leitstellenmitarbeiter";

  $("authError").textContent = "";

  try {

    if (isRegisterMode) {

      const result =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      await updateProfile(
        result.user,
        {
          displayName
        }
      );

      await setDoc(
        doc(db, "users", result.user.uid),
        {
          uid: result.user.uid,
          email,
          displayName,
          createdAt: serverTimestamp()
        }
      );

    } else {

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    }

  } catch (error) {

    console.error(error);

    $("authError").textContent =
      translateFirebaseError(error);

  }

});


function translateFirebaseError(error) {

  const code = error?.code || "";

  const errors = {

    "auth/invalid-email":
      "Die E-Mail-Adresse ist ungültig.",

    "auth/user-not-found":
      "Dieses Konto existiert nicht.",

    "auth/wrong-password":
      "Das Passwort ist falsch.",

    "auth/invalid-credential":
      "E-Mail oder Passwort ist falsch.",

    "auth/email-already-in-use":
      "Diese E-Mail wird bereits verwendet.",

    "auth/weak-password":
      "Das Passwort ist zu schwach.",

    "auth/network-request-failed":
      "Netzwerkfehler."

  };

  return errors[code] || error.message;
}


/* =========================================================
   AUTH STATE
   ========================================================= */

onAuthStateChanged(auth, async user => {

  if (user) {

    currentUser = user;

    $("loginScreen").classList.add("hidden");

    $("app").classList.remove("hidden");

    $("userName").textContent =
      user.displayName || user.email.split("@")[0];

    await loadServers();

    await createPresence();

  } else {

    currentUser = null;

    $("loginScreen").classList.remove("hidden");

    $("app").classList.add("hidden");

  }

});


$("logoutButton").onclick = async () => {

  await signOut(auth);

};


/* =========================================================
   CLOCK
   ========================================================= */

setInterval(() => {

  const now = new Date();

  $("clock").textContent =
    now.toLocaleTimeString("de-DE");

}, 1000);


/* =========================================================
   NAVIGATION
   ========================================================= */

document.querySelectorAll(".nav-button")
.forEach(button => {

  button.addEventListener("click", () => {

    document.querySelectorAll(".nav-button")
      .forEach(b => b.classList.remove("active"));

    button.classList.add("active");

    document.querySelectorAll(".panel")
      .forEach(panel => panel.classList.add("hidden"));

    const target =
      button.dataset.panel + "Panel";

    $(target)?.classList.remove("hidden");

  });

});


/* =========================================================
   MODALS
   ========================================================= */

function openModal(id) {

  $(id).classList.remove("hidden");

}

function closeModal(id) {

  $(id).classList.add("hidden");

}

document.querySelectorAll("[data-close]")
.forEach(button => {

  button.onclick = () =>
    closeModal(button.dataset.close);

});


$("createServerButton").onclick = () =>
  openModal("serverModal");


$("addVehicleButton").onclick = () =>
  openModal("vehicleModal");


$("newOperationButton").onclick = () =>
  openModal("operationModal");


$("newOperationButton2").onclick = () =>
  openModal("operationModal");


/* =========================================================
   FIREBASE SERVERS
   ========================================================= */

async function loadServers() {

  const serversRef =
    collection(db, "servers");

  const q =
    query(
      serversRef,
      orderBy("createdAt", "desc")
    );

  const unsubscribe =
    onSnapshot(q, snapshot => {

      const select =
        $("serverSelect");

      select.innerHTML =
        `<option value="">Server auswählen</option>`;

      snapshot.forEach(serverDoc => {

        const data = serverDoc.data();

        const option =
          document.createElement("option");

        option.value =
          serverDoc.id;

        option.textContent =
          data.name;

        select.appendChild(option);

      });

    });

  unsubscribeFunctions.push(unsubscribe);

}


/* =========================================================
   CREATE SERVER
   ========================================================= */

$("serverForm").addEventListener("submit", async event => {

  event.preventDefault();

  if (!currentUser) return;

  const name =
    $("serverName").value.trim();

  const description =
    $("serverDescription").value.trim();

  const code =
    $("serverCode").value.trim().toUpperCase();


  const server = await addDoc(
    collection(db, "servers"),
    {

      name,

      description,

      code,

      ownerId:
        currentUser.uid,

      ownerName:
        currentUser.displayName ||
        currentUser.email,

      createdAt:
        serverTimestamp(),

      settings: {

        maxPlayers: 20,

        map: "germany",

        realisticMode: true

      }

    }
  );


  await setDoc(
    doc(
      db,
      "servers",
      server.id,
      "members",
      currentUser.uid
    ),
    {

      uid:
        currentUser.uid,

      name:
        currentUser.displayName ||
        currentUser.email,

      role:
        "owner",

      joinedAt:
        serverTimestamp()

    }
  );


  $("serverForm").reset();

  closeModal("serverModal");

  $("serverSelect").value =
    server.id;

  await selectServer(server.id);

});


/* =========================================================
   SERVER SELECT
   ========================================================= */

$("serverSelect").addEventListener(
  "change",
  async event => {

    const serverId =
      event.target.value;

    if (!serverId) return;

    await selectServer(serverId);

  }
);


async function selectServer(serverId) {

  clearRealtimeListeners();

  currentServerId =
    serverId;

  const serverSnap =
    await getDoc(
      doc(db, "servers", serverId)
    );

  if (!serverSnap.exists()) {

    alert("Server nicht gefunden.");

    return;

  }

  currentServer = {

    id: serverSnap.id,

    ...serverSnap.data()

  };

  $("serverTitle").textContent =
    currentServer.name;


  subscribeVehicles();

  subscribeOperations();

  subscribePlayers();

  subscribeReports();

  subscribeRadio();

  subscribeServerPresence();

  initMap();

}


/* =========================================================
   CLEAN LISTENERS
   ========================================================= */

function clearRealtimeListeners() {

  unsubscribeFunctions.forEach(
    unsubscribe => {

      try {

        unsubscribe();

      } catch {}

    }
  );

  unsubscribeFunctions = [];

  vehicles = [];

  operations = [];

  players = [];

  reports = [];

  radioMessages = [];

}


/* =========================================================
   VEHICLES REALTIME
   ========================================================= */

function subscribeVehicles() {

  const refCollection =
    collection(
      db,
      "servers",
      currentServerId,
      "vehicles"
    );


  const unsubscribe =
    onSnapshot(
      refCollection,
      snapshot => {

        vehicles =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );

        renderVehicles();

        updateStats();

        updateMap();

      }
    );


  unsubscribeFunctions.push(unsubscribe);

}


/* =========================================================
   VEHICLE UI
   ========================================================= */

function renderVehicles() {

  const grid =
    $("vehicleGrid");

  if (!vehicles.length) {

    grid.innerHTML =
      `<div class="empty">
        Noch keine Fahrzeuge vorhanden.
       </div>`;

    return;

  }


  grid.innerHTML =
    vehicles.map(vehicle => {

      const icon =
        getVehicleIcon(vehicle.type);

      return `

        <div class="vehicle-card">

          <div class="vehicle-card-header">

            <div class="vehicle-icon">
              ${icon}
            </div>

            <span class="badge ${vehicle.status === "available" ? "green" : "red"}">
              ${vehicle.status === "available"
                ? "VERFÜGBAR"
                : vehicle.status === "alarm"
                  ? "ALARM"
                  : "EINSATZ"}
            </span>

          </div>

          <h3>${escapeHtml(vehicle.name)}</h3>

          <small>
            ${escapeHtml(vehicle.type)}
          </small>

          <div class="vehicle-status">

            Besatzung:
            <b>${vehicle.crew?.length || 0}/${vehicle.seats || 0}</b>

          </div>

          <div class="vehicle-actions">

            <button
              onclick="openVehicle('${vehicle.id}')"
            >
              Details
            </button>

            <button
              onclick="toggleVehicleStatus('${vehicle.id}')"
            >
              ${vehicle.status === "available"
                ? "Besetzen"
                : "Frei melden"}
            </button>

          </div>

        </div>

      `;

    }).join("");

}


function getVehicleIcon(type) {

  if (!type) return "🚒";

  if (type.includes("RTW")) return "🚑";

  if (type.includes("NEF")) return "🚑";

  if (type.includes("POL")) return "🚓";

  if (type.includes("DLK")) return "🚒";

  if (type.includes("ELW")) return "📡";

  return "🚒";

}


/* =========================================================
   ADD VEHICLE
   ========================================================= */

$("vehicleForm").addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    if (!currentServerId) {

      alert("Bitte zuerst einen Server auswählen.");

      return;

    }


    await addDoc(
      collection(
        db,
        "servers",
        currentServerId,
        "vehicles"
      ),
      {

        name:
          $("vehicleName").value.trim(),

        type:
          $("vehicleType").value,

        seats:
          Number($("vehicleSeats").value),

        status:
          "available",

        crew:
          [],

        lat:
          49.45,

        lng:
          11.08,

        createdBy:
          currentUser.uid,

        createdAt:
          serverTimestamp()

      }
    );


    $("vehicleForm").reset();

    closeModal("vehicleModal");

  }
);


/* =========================================================
   VEHICLE STATUS
   ========================================================= */

window.toggleVehicleStatus =
  async function(vehicleId) {

    const vehicle =
      vehicles.find(
        v => v.id === vehicleId
      );

    if (!vehicle) return;

    const newStatus =
      vehicle.status === "available"
        ? "occupied"
        : "available";


    await updateDoc(
      doc(
        db,
        "servers",
        currentServerId,
        "vehicles",
        vehicleId
      ),
      {

        status:
          newStatus

      }
    );

  };


/* =========================================================
   VEHICLE DETAIL / CREW
   ========================================================= */

window.openVehicle =
  function(vehicleId) {

    const vehicle =
      vehicles.find(
        v => v.id === vehicleId
      );

    if (!vehicle) return;


    const crew =
      vehicle.crew || [];


    $("vehicleDetail").innerHTML = `

      <div class="modal-header">

        <div>

          <span class="eyebrow">
            FAHRZEUG
          </span>

          <h2>
            ${escapeHtml(vehicle.name)}
          </h2>

        </div>

        <button
          class="close-modal"
          onclick="closeModal('vehicleDetailModal')"
        >
          ×
        </button>

      </div>

      <p>
        <b>Typ:</b>
        ${escapeHtml(vehicle.type)}
      </p>

      <p>
        <b>Status:</b>
        ${vehicle.status}
      </p>

      <p>
        <b>Besatzung:</b>
        ${crew.length}/${vehicle.seats}
      </p>

      <h3>Besatzung</h3>

      ${
        crew.length
        ? crew.map(
            member =>
              `<div class="player-card">
                <div class="player-avatar">
                  ${escapeHtml(member.name?.[0] || "?")}
                </div>
                <div>
                  <b>${escapeHtml(member.name)}</b>
                  <small>Fahrzeugbesatzung</small>
                </div>
              </div>`
          ).join("")
        : `<div class="empty">
             Noch niemand eingeteilt.
           </div>`
      }

      <button
        class="primary-button"
        style="width:100%;margin-top:15px"
        onclick="joinVehicle('${vehicle.id}')"
      >
        🚒 Fahrzeug besetzen
      </button>

    `;


    openModal("vehicleDetailModal");

  };


window.joinVehicle =
  async function(vehicleId) {

    const vehicle =
      vehicles.find(
        v => v.id === vehicleId
      );

    if (!vehicle) return;


    const crew =
      vehicle.crew || [];


    if (
      crew.some(
        member =>
          member.uid === currentUser.uid
      )
    ) {

      alert(
        "Du sitzt bereits auf diesem Fahrzeug."
      );

      return;

    }


    if (
      crew.length >= vehicle.seats
    ) {

      alert(
        "Das Fahrzeug ist voll."
      );

      return;

    }


    crew.push({

      uid:
        currentUser.uid,

      name:
        currentUser.displayName ||
        currentUser.email

    });


    await updateDoc(
      doc(
        db,
        "servers",
        currentServerId,
        "vehicles",
        vehicleId
      ),
      {

        crew,

        status:
          "occupied"

      }
    );


    closeModal("vehicleDetailModal");

  };


/* =========================================================
   OPERATIONS
   ========================================================= */

function subscribeOperations() {

  const refCollection =
    collection(
      db,
      "servers",
      currentServerId,
      "operations"
    );


  const q =
    query(
      refCollection,
      orderBy("createdAt", "desc")
    );


  const unsubscribe =
    onSnapshot(
      q,
      snapshot => {

        operations =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        renderOperations();

        updateStats();

        updateMap();

      }
    );


  unsubscribeFunctions.push(unsubscribe);

}


/* =========================================================
   CREATE OPERATION
   ========================================================= */

$("operationForm").addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    if (!currentServerId) {

      alert(
        "Bitte zuerst einen Server auswählen."
      );

      return;

    }


    const operation = {

      keyword:
        $("operationKeyword").value,

      address:
        $("operationAddress").value.trim(),

      city:
        $("operationCity").value.trim(),

      priority:
        Number($("operationPriority").value),

      caller:
        $("callerName").value.trim(),

      phone:
        $("callerPhone").value.trim(),

      description:
        $("operationDescription").value.trim(),

      generatedCall:
        $("generatedCall").textContent || "",

      status:
        "open",

      createdBy:
        currentUser.uid,

      createdByName:
        currentUser.displayName,

      createdAt:
        serverTimestamp(),

      assignedVehicles:
        [],

      lat:
        49.45 + (Math.random() - .5) * .1,

      lng:
        11.08 + (Math.random() - .5) * .1

    };


    const result =
      await addDoc(
        collection(
          db,
          "servers",
          currentServerId,
          "operations"
        ),
        operation
      );


    /* FUNKALARM */

    await sendRadioMessage(
      `🚨 ALARM: ${operation.keyword} – ${operation.address}, ${operation.city}`
    );


    /* MELDER */

    playPagerAlarm();


    $("operationForm").reset();

    $("generatedCall").classList.add("hidden");

    closeModal("operationModal");


    /* Einsatzbericht */

    await addDoc(
      collection(
        db,
        "servers",
        currentServerId,
        "reports"
      ),
      {

        operationId:
          result.id,

        keyword:
          operation.keyword,

        address:
          operation.address,

        city:
          operation.city,

        caller:
          operation.caller,

        description:
          operation.description,

        createdAt:
          serverTimestamp(),

        createdBy:
          currentUser.displayName

      }
    );

  }
);


/* =========================================================
   RENDER OPERATIONS
   ========================================================= */

function renderOperations() {

  const active =
    operations.filter(
      op => op.status !== "closed"
    );


  $("operationBadge").textContent =
    active.length;


  const html =
    active.map(
      operation => `

      <div
        class="operation-item"
        onclick="focusOperation('${operation.id}')"
      >

        <strong>
          🚨 ${escapeHtml(operation.keyword)}
        </strong>

        <small>
          ${escapeHtml(operation.address)},
          ${escapeHtml(operation.city)}
        </small>

        <div class="operation-meta">

          <span class="badge red">
            PRIORITÄT ${operation.priority}
          </span>

          <span class="badge">
            ${operation.status}
          </span>

        </div>

      </div>

      `
    ).join("");


  $("operationList").innerHTML =
    html ||
    `<div class="empty">
      Keine aktiven Einsätze
    </div>`;


  $("allOperations").innerHTML =
    operations.map(
      operation => `

      <div class="report-card">

        <h3>
          🚨 ${escapeHtml(operation.keyword)}
        </h3>

        <p>
          ${escapeHtml(operation.description || "Keine Beschreibung")}
        </p>

        <p>
          📍
          ${escapeHtml(operation.address)},
          ${escapeHtml(operation.city)}
        </p>

        <div class="report-footer">

          Status:
          ${operation.status}

          ·

          Priorität:
          ${operation.priority}

          <br>

          ${
            operation.assignedVehicles?.length || 0
          }
          Fahrzeuge alarmiert

        </div>

        <div class="vehicle-actions">

          <button
            onclick="assignVehicle('${operation.id}')"
          >
            🚒 Fahrzeug alarmieren
          </button>

          <button
            onclick="closeOperation('${operation.id}')"
          >
            Einsatz beenden
          </button>

        </div>

      </div>

      `
    ).join("") ||
    `<div class="empty">
      Noch keine Einsätze
    </div>`;

}


window.focusOperation =
  function(operationId) {

    const operation =
      operations.find(
        op => op.id === operationId
      );

    if (!operation || !map) return;


    map.setView(
      [
        operation.lat,
        operation.lng
      ],
      15
    );


    operationMarkers[
      operationId
    ]?.openPopup();

  };


/* =========================================================
   ASSIGN VEHICLE
   ========================================================= */

window.assignVehicle =
  async function(operationId) {

    if (!vehicles.length) {

      alert(
        "Es gibt keine Fahrzeuge."
      );

      return;

    }


    const available =
      vehicles.filter(
        vehicle =>
          vehicle.status === "available"
      );


    if (!available.length) {

      alert(
        "Kein Fahrzeug verfügbar."
      );

      return;

    }


    const vehicle =
      available[0];


    const operation =
      operations.find(
        op => op.id === operationId
      );


    if (!operation) return;


    const assigned =
      operation.assignedVehicles || [];


    assigned.push(vehicle.id);


    await updateDoc(
      doc(
        db,
        "servers",
        currentServerId,
        "operations",
        operationId
      ),
      {

        assignedVehicles:
          assigned,

        status:
          "dispatched"

      }
    );


    await updateDoc(
      doc(
        db,
        "servers",
        currentServerId,
        "vehicles",
        vehicle.id
      ),
      {

        status:
          "alarm",

        operationId

      }
    );


    await sendRadioMessage(
      `${vehicle.name} von Leitstelle alarmiert. Einsatz ${operation.keyword}, ${operation.address}.`
    );

    playPagerAlarm();

  };


/* =========================================================
   CLOSE OPERATION
   ========================================================= */

window.closeOperation =
  async function(operationId) {

    const operation =
      operations.find(
        op => op.id === operationId
      );

    if (!operation) return;


    await updateDoc(
      doc(
        db,
        "servers",
        currentServerId,
        "operations",
        operationId
      ),
      {

        status:
          "closed",

        closedAt:
          serverTimestamp(),

        closedBy:
          currentUser.displayName

      }
    );


    for (
      const vehicleId
      of operation.assignedVehicles || []
    ) {

      await updateDoc(
        doc(
          db,
          "servers",
          currentServerId,
          "vehicles",
          vehicleId
        ),
        {

          status:
            "available",

          operationId:
            null

        }
      );

    }


    await sendRadioMessage(
      `Einsatz ${operation.keyword} in ${operation.city} beendet.`
    );

  };


/* =========================================================
   AI NOTRUF
   ========================================================= */

$("generateCall").onclick =
  function() {

    const keyword =
      $("operationKeyword").value;

    const address =
      $("operationAddress").value ||
      "unbekannte Adresse";

    const city =
      $("operationCity").value ||
      "unbekannter Ort";

    const description =
      $("operationDescription").value;


    const calls = [

      `Notruf: „112, hallo? In ${city} brennt es! Wir sind bei ${address}. Ich kann Rauch sehen. Bitte schicken Sie schnell die Feuerwehr!“`,

      `Notruf: „Hallo, hier ist ein Notruf. Wir haben einen Einsatz bei ${address} in ${city}. Es geht um ${keyword}. Ich weiß nicht genau, wie schlimm es ist.“`,

      `Notruf: „112? Bitte helfen Sie uns. Bei ${address} in ${city} ist etwas passiert. Es handelt sich um ${keyword}. Bitte schicken Sie Einsatzkräfte.“`

    ];


    let text =
      calls[
        Math.floor(
          Math.random() * calls.length
        )
      ];


    if (description) {

      text +=
        ` Weitere Angaben: ${description}`;

    }


    $("generatedCall").textContent =
      text;

    $("generatedCall")
      .classList.remove("hidden");

  };


/* =========================================================
   RADIO
   ========================================================= */

function subscribeRadio() {

  const refCollection =
    collection(
      db,
      "servers",
      currentServerId,
      "radio"
    );


  const q =
    query(
      refCollection,
      orderBy("createdAt", "asc")
    );


  const unsubscribe =
    onSnapshot(
      q,
      snapshot => {

        radioMessages =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        renderRadio();

      }
    );


  unsubscribeFunctions.push(unsubscribe);

}


async function sendRadioMessage(text) {

  if (!currentServerId) return;

  if (!text.trim()) return;


  await addDoc(
    collection(
      db,
      "servers",
      currentServerId,
      "radio"
    ),
    {

      text:
        text.trim(),

      userId:
        currentUser.uid,

      userName:
        currentUser.displayName ||
        "Leitstelle",

      createdAt:
        serverTimestamp()

    }
  );

}


$("radioForm").addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const input =
      $("radioText");

    await sendRadioMessage(
      input.value
    );

    input.value = "";

  }
);


function renderRadio() {

  $("radioMessages").innerHTML =
    radioMessages.map(
      message => {

        let time = "";

        if (
          message.createdAt &&
          message.createdAt.toDate
        ) {

          time =
            message.createdAt
              .toDate()
              .toLocaleTimeString(
                "de-DE"
              );

        }


        return `

          <div class="radio-message">

            <span class="time">
              ${time}
            </span>

            <span class="name">
              ${escapeHtml(
                message.userName || "FUNK"
              )}
            </span>

            <div class="text">
              ${escapeHtml(message.text)}
            </div>

          </div>

        `;

      }
    ).join("");


  $("radioMessages").scrollTop =
    $("radioMessages").scrollHeight;

}


/* =========================================================
   PAGER SOUND
   ========================================================= */

function playPagerAlarm() {

  const audio =
    new Audio(
      "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
    );

  audio.volume = .8;

  audio.play()
    .catch(() => {});

}


$("radioTransmit").addEventListener(
  "mousedown",
  startMicrophone
);

$("radioTransmit").addEventListener(
  "mouseup",
  stopMicrophone
);

$("radioTransmit").addEventListener(
  "mouseleave",
  stopMicrophone
);


/* =========================================================
   MICROPHONE
   ========================================================= */

async function startMicrophone() {

  try {

    microphoneStream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: true
        }
      );


    $("radioTransmit")
      .classList.add("active");

    $("micStatus").textContent =
      "MIKROFON AKTIV";


    await sendRadioMessage(
      "🎙️ " +
      (
        currentUser.displayName ||
        "Funkteilnehmer"
      ) +
      " spricht"
    );

  } catch (error) {

    console.error(error);

    alert(
      "Der Mikrofonzugriff wurde nicht erlaubt."
    );

  }

}


function stopMicrophone() {

  if (microphoneStream) {

    microphoneStream
      .getTracks()
      .forEach(track => track.stop());

    microphoneStream = null;

  }


  $("radioTransmit")
    .classList.remove("active");

  $("micStatus").textContent =
    "Nicht verbunden";

}


/* =========================================================
   PLAYERS
   ========================================================= */

function subscribePlayers() {

  const membersRef =
    collection(
      db,
      "servers",
      currentServerId,
      "members"
    );


  const unsubscribe =
    onSnapshot(
      membersRef,
      snapshot => {

        players =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        renderPlayers();

        updateStats();

      }
    );


  unsubscribeFunctions.push(unsubscribe);

}


function renderPlayers() {

  $("playersList").innerHTML =
    players.map(
      player => `

        <div class="player-card">

          <div class="player-avatar">
            ${escapeHtml(
              player.name?.[0] || "?"
            )}
          </div>

          <div>

            <b>
              ${escapeHtml(
                player.name || "Spieler"
              )}
            </b>

            <small>
              ${player.role || "Mitspieler"}
            </small>

          </div>

        </div>

      `
    ).join("");

}


/* =========================================================
   REPORTS
   ========================================================= */

function subscribeReports() {

  const refCollection =
    collection(
      db,
      "servers",
      currentServerId,
      "reports"
    );


  const q =
    query(
      refCollection,
      orderBy("createdAt", "desc")
    );


  const unsubscribe =
    onSnapshot(
      q,
      snapshot => {

        reports =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        renderReports();

      }
    );


  unsubscribeFunctions.push(unsubscribe);

}


function renderReports() {

  $("reportsList").innerHTML =
    reports.map(
      report => `

        <div class="report-card">

          <h3>
            🚨 ${escapeHtml(report.keyword)}
          </h3>

          <p>
            <b>Einsatzort:</b>
            ${escapeHtml(report.address)},
            ${escapeHtml(report.city)}
          </p>

          <p>
            <b>Anrufer:</b>
            ${escapeHtml(report.caller || "Unbekannt")}
          </p>

          <p>
            ${escapeHtml(
              report.description ||
              "Keine Beschreibung"
            )}
          </p>

          <div class="report-footer">

            Erstellt von:
            ${escapeHtml(
              report.createdBy || "Unbekannt"
            )}

          </div>

        </div>

      `
    ).join("") ||
    `<div class="empty">
      Noch keine Einsatzberichte
    </div>`;

}


/* =========================================================
   MAP
   ========================================================= */

function initMap() {

  setTimeout(() => {

    if (!map) {

      map =
        L.map("map")
          .setView(
            [49.45, 11.08],
            10
          );


      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            "&copy; OpenStreetMap"
        }
      ).addTo(map);

    }


    map.invalidateSize();

    updateMap();

  }, 100);

}


function updateMap() {

  if (!map) return;


  /* Fahrzeuge */

  vehicles.forEach(
    vehicle => {

      if (
        !vehicle.lat ||
        !vehicle.lng
      ) return;


      const popup = `

        <b>${escapeHtml(
          vehicle.name
        )}</b>

        <br>

        ${escapeHtml(
          vehicle.type
        )}

        <br>

        Status:
        ${vehicle.status}

      `;


      if (
        vehicleMarkers[vehicle.id]
      ) {

        vehicleMarkers[
          vehicle.id
        ]
        .setLatLng([
          vehicle.lat,
          vehicle.lng
        ])
        .setPopupContent(popup);

      } else {

        vehicleMarkers[
          vehicle.id
        ] =
          L.marker([
            vehicle.lat,
            vehicle.lng
          ])
          .addTo(map)
          .bindPopup(popup);

      }

    }
  );


  /* Einsätze */

  operations
    .filter(
      op =>
        op.status !== "closed"
    )
    .forEach(
      operation => {

        const popup = `

          <b>🚨 ${
            escapeHtml(
              operation.keyword
            )
          }</b>

          <br>

          ${
            escapeHtml(
              operation.address
            )
          }

          <br>

          ${
            escapeHtml(
              operation.city
            )
          }

          <br>

          Priorität:
          ${operation.priority}

        `;


        if (
          operationMarkers[
            operation.id
          ]
        ) {

          operationMarkers[
            operation.id
          ]
          .setLatLng([
            operation.lat,
            operation.lng
          ])
          .setPopupContent(popup);

        } else {

          operationMarkers[
            operation.id
          ] =
            L.circleMarker(
              [
                operation.lat,
                operation.lng
              ],
              {
                radius: 10,
                color: "#ff3347",
                fillColor: "#ff3347",
                fillOpacity: .8
              }
            )
            .addTo(map)
            .bindPopup(popup);

        }

      }
    );

}


/* =========================================================
   PRESENCE
   ========================================================= */

async function createPresence() {

  if (!currentUser) return;

  const presenceRef =
    ref(
      realtimeDB,
      `presence/${currentUser.uid}`
    );


  await set(
    presenceRef,
    {

      uid:
        currentUser.uid,

      name:
        currentUser.displayName ||
        currentUser.email,

      online:
        true,

      lastSeen:
        Date.now()

    }
  );


  onDisconnect(
    presenceRef
  ).remove();


  onValue(
    ref(realtimeDB, "presence"),
    snapshot => {

      const data =
        snapshot.val() || {};

      const count =
        Object.keys(data).length;

      $("onlineCount").textContent =
        `${count} online`;

      $("statPlayers").textContent =
        count;

    }
  );

}


/* =========================================================
   SERVER PRESENCE
   ========================================================= */

function subscribeServerPresence() {

  /* Für spätere serverbezogene
     Online-Spieler-Erweiterungen */

}


/* =========================================================
   STATS
   ========================================================= */

function updateStats() {

  $("statVehicles").textContent =
    vehicles.length;

  $("statOperations").textContent =
    operations.filter(
      op =>
        op.status !== "closed"
    ).length;

  $("statAvailable").textContent =
    vehicles.filter(
      vehicle =>
        vehicle.status === "available"
    ).length;

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   GLOBAL CLOSE MODAL
   ========================================================= */

window.closeModal =
  closeModal;
