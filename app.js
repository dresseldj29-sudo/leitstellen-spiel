/* =========================================================
   LEITSTELLE X
   app.js
========================================================= */


/* =========================================================
   FIREBASE KONFIGURATION
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

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();

const db = firebase.firestore();


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentServer = null;

let profile = null;

let vehicles = [];

let operations = [];

let players = [];

let radioMessages = [];

let map = null;

let vehicleMarkers = {};

let operationMarkers = {};

let unsubscribeServers = null;

let unsubscribePlayers = null;

let unsubscribeVehicles = null;

let unsubscribeOperations = null;

let unsubscribeRadio = null;

let micStream = null;

let mediaRecorder = null;


/* =========================================================
   DOM
========================================================= */

const authScreen =
    document.getElementById("authScreen");

const app =
    document.getElementById("app");

const authButton =
    document.getElementById("authButton");

const loginTab =
    document.getElementById("loginTab");

const registerTab =
    document.getElementById("registerTab");

const displayNameField =
    document.getElementById("displayNameField");

let authMode = "login";


/* =========================================================
   AUTH TABS
========================================================= */

loginTab.onclick = () => {

    authMode = "login";

    loginTab.classList.add("active");

    registerTab.classList.remove("active");

    displayNameField.classList.add("hidden");

    authButton.textContent = "Anmelden";

};


registerTab.onclick = () => {

    authMode = "register";

    registerTab.classList.add("active");

    loginTab.classList.remove("active");

    displayNameField.classList.remove("hidden");

    authButton.textContent =
        "Konto erstellen";

};


/* =========================================================
   AUTH
========================================================= */

authButton.onclick = async () => {

    const email =
        document
            .getElementById("authEmail")
            .value
            .trim();

    const password =
        document
            .getElementById("authPassword")
            .value;

    const name =
        document
            .getElementById("displayName")
            .value
            .trim();


    showAuthError("");


    if (!email || !password) {

        showAuthError(
            "Bitte E-Mail und Passwort eingeben."
        );

        return;
    }


    try {

        if (authMode === "login") {

            await auth.signInWithEmailAndPassword(
                email,
                password
            );

        } else {

            if (!name) {

                showAuthError(
                    "Bitte einen Anzeigenamen eingeben."
                );

                return;
            }


            const result =
                await auth
                    .createUserWithEmailAndPassword(
                        email,
                        password
                    );


            await db
                .collection("users")
                .doc(result.user.uid)
                .set({

                    uid:
                        result.user.uid,

                    email:
                        email,

                    displayName:
                        name,

                    createdAt:
                        firebase.firestore
                            .FieldValue
                            .serverTimestamp()

                });

        }

    } catch (error) {

        showAuthError(
            translateFirebaseError(error)
        );

    }

};


/* =========================================================
   AUTH FEHLER
========================================================= */

function showAuthError(message) {

    const box =
        document.getElementById("authError");


    if (!message) {

        box.classList.add("hidden");

        return;
    }


    box.textContent = message;

    box.classList.remove("hidden");

}


function translateFirebaseError(error) {

    const errors = {

        "auth/invalid-email":
            "Die E-Mail-Adresse ist ungültig.",

        "auth/user-not-found":
            "Dieses Konto wurde nicht gefunden.",

        "auth/wrong-password":
            "Das Passwort ist falsch.",

        "auth/email-already-in-use":
            "Diese E-Mail wird bereits verwendet.",

        "auth/weak-password":
            "Das Passwort muss mindestens 6 Zeichen haben.",

        "auth/invalid-credential":
            "E-Mail oder Passwort ist falsch."

    };


    return errors[error.code] ||
        error.message ||
        "Unbekannter Fehler.";

}


/* =========================================================
   AUTH STATE
========================================================= */

auth.onAuthStateChanged(
    async user => {

        if (user) {

            currentUser = user;

            authScreen.classList.add(
                "hidden"
            );

            app.classList.remove(
                "hidden"
            );


            await loadProfile();

            listenServers();

            await autoJoinServer();

            updateProfile();

        } else {

            currentUser = null;

            authScreen.classList.remove(
                "hidden"
            );

            app.classList.add(
                "hidden"
            );

            cleanupListeners();

        }

    }
);


/* =========================================================
   PROFIL
========================================================= */

async function loadProfile() {

    const snap =
        await db
            .collection("users")
            .doc(currentUser.uid)
            .get();


    if (snap.exists) {

        profile = snap.data();

    } else {

        profile = {

            displayName:
                currentUser.email
                    .split("@")[0]

        };

    }

}


function updateProfile() {

    document.getElementById(
        "profileName"
    ).textContent =
        profile?.displayName || "-";


    document.getElementById(
        "profileEmail"
    ).textContent =
        currentUser?.email || "-";


    document.getElementById(
        "profileServer"
    ).textContent =
        currentServer?.name || "Keiner";

}


/* =========================================================
   LOGOUT
========================================================= */

document
    .getElementById("logoutButton")
    .onclick = async () => {

        await removePlayerPresence();

        cleanupListeners();

        await auth.signOut();

    };


/* =========================================================
   SERVER LISTENER
========================================================= */

function listenServers() {

    if (unsubscribeServers)
        unsubscribeServers();


    unsubscribeServers =
        db
            .collection("servers")
            .orderBy("createdAt", "desc")
            .onSnapshot(

                snapshot => {

                    const list = [];


                    snapshot.forEach(doc => {

                        list.push({

                            id: doc.id,

                            ...doc.data()

                        });

                    });


                    renderServers(list);

                },

                error => {

                    console.error(
                        "Server Listener:",
                        error
                    );

                    toast(
                        "Server",
                        "Server konnten nicht geladen werden.",
                        "error"
                    );

                }

            );

}


/* =========================================================
   AUTOMATISCHEN SERVER LADEN
========================================================= */

async function autoJoinServer() {

    const saved =
        localStorage.getItem(
            "leitstelle_server"
        );


    if (!saved)
        return;


    try {

        const snap =
            await db
                .collection("servers")
                .doc(saved)
                .get();


        if (!snap.exists)
            return;


        await joinServer({

            id: snap.id,

            ...snap.data()

        });

    } catch (error) {

        console.error(error);

    }

}


/* =========================================================
   SERVER FORM
========================================================= */

function openServerForm() {

    document
        .getElementById("serverForm")
        .classList.remove("hidden");

}


function closeServerForm() {

    document
        .getElementById("serverForm")
        .classList.add("hidden");

}


/* =========================================================
   SERVER ERSTELLEN
========================================================= */

async function createServer() {

    if (!currentUser)
        return;


    const name =
        document
            .getElementById("serverName")
            .value
            .trim();


    const description =
        document
            .getElementById("serverDescription")
            .value
            .trim();


    if (!name) {

        toast(
            "Server",
            "Bitte einen Namen eingeben.",
            "error"
        );

        return;
    }


    try {

        const ref =
            await db
                .collection("servers")
                .add({

                    name,

                    description:
                        description ||
                        "Leitstellenserver",

                    ownerId:
                        currentUser.uid,

                    ownerName:
                        profile.displayName,

                    createdAt:
                        firebase.firestore
                            .FieldValue
                            .serverTimestamp()

                });


        closeServerForm();


        await joinServer({

            id: ref.id,

            name,

            description

        });


        toast(
            "Server erstellt",
            name,
            "success"
        );


    } catch (error) {

        console.error(error);

        toast(
            "Server",
            error.message,
            "error"
        );

    }

}


/* =========================================================
   SERVER ANZEIGEN
========================================================= */

function renderServers(list) {

    const container =
        document.getElementById(
            "serversList"
        );


    container.innerHTML = "";


    if (!list.length) {

        container.innerHTML = `

            <div class="card">

                Noch keine Server vorhanden.

            </div>

        `;

        return;
    }


    list.forEach(server => {

        const div =
            document.createElement("div");


        div.className =
            "card server-card";


        const active =
            currentServer?.id === server.id;


        div.innerHTML = `

            <div class="card-title">

                🖥️
                ${escapeHTML(server.name)}

            </div>


            <div class="list-sub">

                ${escapeHTML(
                    server.description || ""
                )}

            </div>


            <div class="server-actions">

                <button
                    class="action-btn
                    ${active ? "green" : "blue"}"
                    onclick="
                        joinServerById(
                            '${server.id}'
                        )
                    ">

                    ${
                        active
                            ? "✓ Verbunden"
                            : "Beitreten"
                    }

                </button>

            </div>

        `;


        container.appendChild(div);

    });

}


/* =========================================================
   SERVER BEITRETEN
========================================================= */

async function joinServerById(id) {

    try {

        const snap =
            await db
                .collection("servers")
                .doc(id)
                .get();


        if (!snap.exists) {

            toast(
                "Server",
                "Server existiert nicht mehr.",
                "error"
            );

            return;
        }


        await joinServer({

            id: snap.id,

            ...snap.data()

        });

    } catch (error) {

        toast(
            "Server",
            error.message,
            "error"
        );

    }

}


/* =========================================================
   SERVER JOIN
========================================================= */

async function joinServer(server) {

    cleanupServerListeners();


    currentServer = server;


    localStorage.setItem(
        "leitstelle_server",
        server.id
    );


    document.getElementById(
        "currentServerName"
    ).textContent =
        server.name;


    updateProfile();


    await setPlayerPresence();


    listenPlayers();

    listenVehicles();

    listenOperations();

    listenRadio();


    toast(
        "Server",
        `Verbunden mit ${server.name}`,
        "success"
    );

}


/* =========================================================
   PLAYER PRESENCE
========================================================= */

async function setPlayerPresence() {

    if (!currentServer ||
        !currentUser)
        return;


    await serverCollection(
        "players"
    )
        .doc(currentUser.uid)
        .set({

            uid:
                currentUser.uid,

            name:
                profile.displayName,

            email:
                currentUser.email,

            online:
                true,

            lastSeen:
                firebase.firestore
                    .FieldValue
                    .serverTimestamp(),

            joinedAt:
                firebase.firestore
                    .FieldValue
                    .serverTimestamp()

        }, {

            merge: true

        });

}


async function removePlayerPresence() {

    if (!currentServer ||
        !currentUser)
        return;


    try {

        await serverCollection(
            "players"
        )
            .doc(currentUser.uid)
            .update({

                online: false,

                lastSeen:
                    firebase.firestore
                        .FieldValue
                        .serverTimestamp()

            });

    } catch (error) {

        console.warn(
            "Presence:",
            error
        );

    }

}


/* =========================================================
   PLAYERS
========================================================= */

function listenPlayers() {

    unsubscribePlayers =
        serverCollection("players")
            .onSnapshot(

                snapshot => {

                    players = [];


                    snapshot.forEach(doc => {

                        const data =
                            doc.data();


                        if (data.online !== false) {

                            players.push({

                                id: doc.id,

                                ...data

                            });

                        }

                    });


                    document.getElementById(
                        "onlineCounter"
                    ).textContent =
                        `● ${players.length} online`;


                    document.getElementById(
                        "statPlayers"
                    ).textContent =
                        players.length;

                }

            );

}


/* =========================================================
   FAHRZEUGE
========================================================= */

function listenVehicles() {

    unsubscribeVehicles =
        serverCollection("vehicles")
            .onSnapshot(

                snapshot => {

                    vehicles = [];


                    snapshot.forEach(doc => {

                        vehicles.push({

                            id: doc.id,

                            ...doc.data()

                        });

                    });


                    renderVehicles();

                    updateDashboard();

                    updateMap();

                }

            );

}


function openVehicleForm() {

    document
        .getElementById("vehicleForm")
        .classList.remove("hidden");

}


function closeVehicleForm() {

    document
        .getElementById("vehicleForm")
        .classList.add("hidden");

}


/* =========================================================
   FAHRZEUG ERSTELLEN
========================================================= */

async function createVehicle() {

    if (!currentServer) {

        toast(
            "Fahrzeug",
            "Bitte zuerst einen Server auswählen.",
            "error"
        );

        return;
    }


    const callsign =
        document
            .getElementById(
                "vehicleCallsign"
            )
            .value
            .trim();


    const type =
        document.getElementById(
            "vehicleType"
        ).value;


    const seats =
        Number(
            document
                .getElementById(
                    "vehicleSeats"
                )
                .value
        );


    if (!callsign) {

        toast(
            "Fahrzeug",
            "Funkrufname fehlt.",
            "error"
        );

        return;
    }


    if (!seats ||
        seats < 1 ||
        seats > 20) {

        toast(
            "Fahrzeug",
            "Besatzungsplätze müssen zwischen 1 und 20 liegen.",
            "error"
        );

        return;
    }


    try {

        await serverCollection(
            "vehicles"
        )
            .add({

                callsign,

                type,

                seats,

                crew: [],

                status:
                    "Frei",

                latitude:
                    49.415,

                longitude:
                    11.011,

                createdBy:
                    currentUser.uid,

                createdAt:
                    firebase.firestore
                        .FieldValue
                        .serverTimestamp()

            });


        closeVehicleForm();


        toast(
            "Fahrzeug",
            `${callsign} wurde erstellt.`,
            "success"
        );

    } catch (error) {

        toast(
            "Fahrzeug",
            error.message,
            "error"
        );

    }

}


/* =========================================================
   FAHRZEUGE RENDERN
========================================================= */

function renderVehicles() {

    const container =
        document.getElementById(
            "vehiclesList"
        );


    container.innerHTML = "";


    if (!vehicles.length) {

        container.innerHTML = `

            <div class="card">

                Noch keine Fahrzeuge vorhanden.

            </div>

        `;

        return;
    }


    vehicles.forEach(vehicle => {

        const div =
            document.createElement("div");


        div.className =
            "card";


        const statusClass =
            vehicle.status === "Frei"
                ? "green"
                : vehicle.status === "Einsatz"
                    ? "red"
                    : "yellow";


        const crew =
            Array.isArray(vehicle.crew)
                ? vehicle.crew
                : [];


        div.innerHTML = `

            <div class="stat">

                <div>

                    <div class="card-title">

                        🚒
                        ${escapeHTML(
                            vehicle.callsign
                        )}

                    </div>


                    <div class="list-sub">

                        ${escapeHTML(
                            vehicle.type || ""
                        )}

                    </div>

                </div>


                <span
                    class="badge ${statusClass}">

                    ${escapeHTML(
                        vehicle.status ||
                        "Frei"
                    )}

                </span>

            </div>


            <br>


            <div class="list-sub">

                Besatzung:

                ${crew.length}/
                ${vehicle.seats || 0}

            </div>


            ${
                crew.length
                    ? `

                    <div class="list-sub">

                        ${crew
                            .map(
                                member =>
                                    "👤 " +
                                    escapeHTML(
                                        member.name
                                    )
                            )
                            .join(" · ")}

                    </div>

                    `
                    : ""
            }


            <br>


            <div class="actions">

                <button
                    class="action-btn green"
                    onclick="
                        occupyVehicle(
                            '${vehicle.id}'
                        )
                    ">

                    👤 Besetzen

                </button>


                <button
                    class="action-btn red"
                    onclick="
                        setVehicleStatus(
                            '${vehicle.id}',
                            'Einsatz'
                        )
                    ">

                    🚨 Einsatz

                </button>


                <button
                    class="action-btn"
                    onclick="
                        setVehicleStatus(
                            '${vehicle.id}',
                            'Frei'
                        )
                    ">

                    🟢 Frei

                </button>

            </div>

        `;


        container.appendChild(div);

    });

}


/* =========================================================
   FAHRZEUG BESETZEN
========================================================= */

async function occupyVehicle(id) {

    const ref =
        serverCollection(
            "vehicles"
        ).doc(id);


    const snap =
        await ref.get();


    if (!snap.exists)
        return;


    const vehicle =
        snap.data();


    const crew =
        Array.isArray(vehicle.crew)
            ? [...vehicle.crew]
            : [];


    const already =
        crew.some(
            member =>
                member.uid ===
                currentUser.uid
        );


    if (already) {

        toast(
            "Besatzung",
            "Du bist bereits auf diesem Fahrzeug.",
            "error"
        );

        return;
    }


    if (
        crew.length >=
        Number(vehicle.seats || 0)
    ) {

        toast(
            "Besatzung",
            "Keine freien Sitzplätze.",
            "error"
        );

        return;
    }


    crew.push({

        uid:
            currentUser.uid,

        name:
            profile.displayName

    });


    await ref.update({

        crew

    });


    toast(
        "Besatzung",
        "Du sitzt jetzt auf dem Fahrzeug.",
        "success"
    );

}


/* =========================================================
   FAHRZEUGSTATUS
========================================================= */

async function setVehicleStatus(
    id,
    status
) {

    try {

        await serverCollection(
            "vehicles"
        )
            .doc(id)
            .update({

                status,

                statusChangedAt:
                    firebase.firestore
                        .FieldValue
                        .serverTimestamp(),

                statusChangedBy:
                    currentUser.uid

            });


        toast(
            "Fahrzeug",
            `Status: ${status}`,
            "success"
        );

    } catch (error) {

        toast(
            "Fahrzeug",
            error.message,
            "error"
        );

    }

}


/* =========================================================
   EINSÄTZE
========================================================= */

function listenOperations() {

    unsubscribeOperations =
        serverCollection(
            "operations"
        )
            .orderBy(
                "createdAt",
                "desc"
            )
            .onSnapshot(

                snapshot => {

                    const previous =
                        operations.map(
                            operation =>
                                operation.id
                        );


                    operations = [];


                    snapshot.forEach(doc => {

                        operations.push({

                            id: doc.id,

                            ...doc.data()

                        });

                    });


                    renderOperations();

                    updateDashboard();

                    updateMap();


                    const newest =
                        operations[0];


                    if (
                        newest &&
                        !previous.includes(
                            newest.id
                        ) &&
                        newest.createdBy !==
                            currentUser.uid
                    ) {

                        showAlarm(newest);

                    }

                }

            );

}


/* =========================================================
   EINSATZ FORM
========================================================= */

function openOperationForm() {

    document
        .getElementById(
            "operationForm"
        )
        .classList.remove("hidden");

}


function closeOperationForm() {

    document
        .getElementById(
            "operationForm"
        )
        .classList.add("hidden");

}


/* =========================================================
   EINSATZ ERSTELLEN
========================================================= */

async function createOperation(
    suppliedData = null
) {

    if (!currentServer) {

        toast(
            "Einsatz",
            "Bitte zuerst einen Server auswählen.",
            "error"
        );

        return;
    }


    const operation =
        suppliedData || {

            keyword:
                document
                    .getElementById(
                        "opKeyword"
                    )
                    .value
                    .trim(),

            priority:
                Number(
                    document
                        .getElementById(
                            "opPriority"
                        )
                        .value
                ),

            address:
                document
                    .getElementById(
                        "opAddress"
                    )
                    .value
                    .trim(),

            caller:
                document
                    .getElementById(
                        "opCaller"
                    )
                    .value
                    .trim(),

            phone:
                document
                    .getElementById(
                        "opPhone"
                    )
                    .value
                    .trim(),

            description:
                document
                    .getElementById(
                        "opDescription"
                    )
                    .value
                    .trim()

        };


    if (!operation.keyword) {

        toast(
            "Einsatz",
            "Einsatzstichwort fehlt.",
            "error"
        );

        return;
    }


    try {

        await serverCollection(
            "operations"
        )
            .add({

                keyword:
                    operation.keyword,

                priority:
                    Number(
                        operation.priority || 1
                    ),

                address:
                    operation.address ||
                    "Unbekannte Adresse",

                caller:
                    operation.caller ||
                    "Unbekannter Anrufer",

                phone:
                    operation.phone || "",

                description:
                    operation.description || "",

                status:
                    "Offen",

                alarmedVehicles:
                    [],

                latitude:
                    Number(
                        operation.latitude ||
                        49.415
                    ),

                longitude:
                    Number(
                        operation.longitude ||
                        11.011
                    ),

                createdBy:
                    currentUser.uid,

                createdByName:
                    profile.displayName,

                createdAt:
                    firebase.firestore
                        .FieldValue
                        .serverTimestamp()

            });


        closeOperationForm();


        toast(
            "Einsatz",
            "Einsatz wurde angelegt.",
            "success"
        );


        playAlarm();


    } catch (error) {

        toast(
            "Einsatz",
            error.message,
            "error"
        );

    }

}


/* =========================================================
   EINSÄTZE RENDERN
========================================================= */

function renderOperations() {

    const container =
        document.getElementById(
            "operationsList"
        );


    container.innerHTML = "";


    const active =
        operations.filter(
            operation =>
                operation.status !==
                "Beendet"
        );


    if (!active.length) {

        container.innerHTML = `

            <div class="card">

                Keine aktiven Einsätze.

            </div>

        `;

        return;
    }


    active.forEach(operation => {

        const div =
            document.createElement("div");


        div.className =
            "card";


        const priorityClass =
            Number(operation.priority) === 3
                ? "red"
                : Number(operation.priority) === 2
                    ? "yellow"
                    : "blue";


        div.innerHTML = `

            <div class="stat">

                <div>

                    <div class="card-title">

                        🚨
                        ${escapeHTML(
                            operation.keyword
                        )}

                    </div>


                    <div class="list-sub">

                        📍
                        ${escapeHTML(
                            operation.address
                        )}

                    </div>

                </div>


                <span
                    class="badge ${priorityClass}">

                    P${operation.priority || 1}

                </span>

            </div>


            <br>


            <div class="list">

                <div class="list-item">

                    <div class="list-main">

                        <div class="list-title">

                            Anrufer

                        </div>

                        <div class="list-sub">

                            ${escapeHTML(
                                operation.caller
                            )}

                            ${
                                operation.phone
                                    ? " · " +
                                      escapeHTML(
                                          operation.phone
                                      )
                                    : ""
                            }

                        </div>

                    </div>

                </div>


                <div class="list-item">

                    <div class="list-main">

                        <div class="list-title">

                            Meldung

                        </div>

                        <div class="list-sub">

                            ${escapeHTML(
                                operation.description
                            )}

                        </div>

                    </div>

                </div>


                <div class="list-item">

                    <div class="list-main">

                        <div class="list-title">

                            Status

                        </div>

                        <div class="list-sub">

                            ${escapeHTML(
                                operation.status
                            )}

                        </div>

                    </div>

                </div>

            </div>


            <br>


            <div class="actions">

                <button
                    class="action-btn red"
                    onclick="
                        alarmVehicles(
                            '${operation.id}'
                        )
                    ">

                    🚨 Fahrzeuge alarmieren

                </button>


                <button
                    class="action-btn green"
                    onclick="
                        finishOperation(
                            '${operation.id}'
                        )
                    ">

                    ✓ Einsatz beenden

                </button>

            </div>

        `;


        container.appendChild(div);

    });

}


/* =========================================================
   FAHRZEUGE ALARMIEREN
========================================================= */

async function alarmVehicles(
    operationId
) {

    const freeVehicles =
        vehicles.filter(
            vehicle =>
                vehicle.status ===
                "Frei"
        );


    if (!freeVehicles.length) {

        toast(
            "Alarmierung",
            "Keine freien Fahrzeuge vorhanden.",
            "error"
        );

        return;
    }


    const vehicleIds =
        freeVehicles.map(
            vehicle =>
                vehicle.id
        );


    const batch =
        db.batch();


    batch.update(

        serverCollection(
            "operations"
        ).doc(operationId),

        {

            alarmedVehicles:
                vehicleIds,

            status:
                "Alarmiert",

            alarmedAt:
                firebase.firestore
                    .FieldValue
                    .serverTimestamp(),

            alarmedBy:
                currentUser.uid

        }

    );


    freeVehicles.forEach(
        vehicle => {

            batch.update(

                serverCollection(
                    "vehicles"
                ).doc(vehicle.id),

                {

                    status:
                        "Einsatz",

                    currentOperation:
                        operationId

                }

            );

        }
    );


    await batch.commit();


    toast(
        "Alarmierung",
        `${freeVehicles.length} Fahrzeuge alarmiert.`,
        "success"
    );


    playAlarm();

}


/* =========================================================
   EINSATZ BEENDEN
========================================================= */

async function finishOperation(
    operationId
) {

    const ref =
        serverCollection(
            "operations"
        ).doc(operationId);


    const snap =
        await ref.get();


    if (!snap.exists)
        return;


    const operation =
        snap.data();


    const batch =
        db.batch();


    const vehicleIds =
        Array.isArray(
            operation.alarmedVehicles
        )
            ? operation.alarmedVehicles
            : [];


    vehicleIds.forEach(
        vehicleId => {

            batch.update(

                serverCollection(
                    "vehicles"
                ).doc(vehicleId),

                {

                    status:
                        "Frei",

                    currentOperation:
                        firebase.firestore
                            .FieldValue
                            .delete()

                }

            );

        }
    );


    batch.update(

        ref,

        {

            status:
                "Beendet",

            endedAt:
                firebase.firestore
                    .FieldValue
                    .serverTimestamp(),

            endedBy:
                currentUser.uid,

            report: {

                completed:
                    true,

                completedBy:
                    profile.displayName,

                completedAt:
                    new Date().toISOString()

            }

        }

    );


    await batch.commit();


    toast(
        "Einsatz",
        "Einsatz wurde beendet.",
        "success"
    );

}


/* =========================================================
   ÜBUNGSNOTRUF
========================================================= */

function createTrainingCall() {

    const calls = [

        {

            keyword:
                "Brand Gebäude",

            address:
                "Musterstraße 12, Stein",

            caller:
                "Max Mustermann",

            phone:
                "+49 170 123456",

            description:
                "Rauchentwicklung aus einem Gebäude. Mehrere Personen werden vermutet.",

            priority:
                3,

            latitude:
                49.415,

            longitude:
                11.011

        },

        {

            keyword:
                "Verkehrsunfall",

            address:
                "Hauptstraße 45, Stein",

            caller:
                "Anna Müller",

            phone:
                "+49 171 987654",

            description:
                "Verkehrsunfall mit zwei beteiligten Fahrzeugen.",

            priority:
                2,

            latitude:
                49.418,

            longitude:
                11.018

        },

        {

            keyword:
                "Unklare Rauchentwicklung",

            address:
                "Industriestraße 8, Stein",

            caller:
                "Passant",

            phone:
                "+49 160 555555",

            description:
                "Starke Rauchentwicklung im Bereich eines Gebäudes.",

            priority:
                2,

            latitude:
                49.410,

            longitude:
                11.005

        }

    ];


    const call =
        calls[
            Math.floor(
                Math.random() *
                calls.length
            )
        ];


    createOperation(call);

}


/* =========================================================
   FUNK
========================================================= */

function listenRadio() {

    unsubscribeRadio =
        serverCollection("radio")
            .orderBy(
                "createdAt",
                "asc"
            )
            .limitToLast(100)
            .onSnapshot(

                snapshot => {

                    radioMessages = [];


                    snapshot.forEach(doc => {

                        radioMessages.push({

                            id:
                                doc.id,

                            ...doc.data()

                        });

                    });


                    renderRadio();

                }

            );

}


function renderRadio() {

    const container =
        document.getElementById(
            "radioMessages"
        );


    container.innerHTML = "";


    radioMessages.forEach(
        message => {

            const div =
                document.createElement(
                    "div"
                );


            div.className =
                "radio-message " +
                (
                    message.uid ===
                    currentUser.uid
                        ? "mine"
                        : ""
                );


            let time = "";


            if (
                message.createdAt &&
                typeof message
                    .createdAt
                    .toDate ===
                    "function"
            ) {

                time =
                    message.createdAt
                        .toDate()
                        .toLocaleTimeString(
                            "de-DE",
                            {
                                hour:
                                    "2-digit",

                                minute:
                                    "2-digit"
                            }
                        );

            }


            div.innerHTML = `

                <div class="radio-meta">

                    ${escapeHTML(
                        message.name ||
                        "Unbekannt"
                    )}

                    ·

                    ${time}

                </div>


                <div class="radio-text">

                    ${escapeHTML(
                        message.text ||
                        ""
                    )}

                </div>

            `;


            container.appendChild(div);

        }
    );


    container.scrollTop =
        container.scrollHeight;

}


/* =========================================================
   FUNK SENDEN
========================================================= */

async function sendRadioMessage() {

    const input =
        document.getElementById(
            "radioInput"
        );


    const text =
        input.value.trim();


    if (!text)
        return;


    if (!currentServer) {

        toast(
            "Funk",
            "Kein Server ausgewählt.",
            "error"
        );

        return;
    }


    try {

        await serverCollection(
            "radio"
        )
            .add({

                uid:
                    currentUser.uid,

                name:
                    profile.displayName,

                text,

                type:
                    "text",

                createdAt:
                    firebase.firestore
                        .FieldValue
                        .serverTimestamp()

            });


        input.value = "";


    } catch (error) {

        toast(
            "Funk",
            error.message,
            "error"
        );

    }

}


/* =========================================================
   FUNK ENTER
========================================================= */

document
    .getElementById("radioInput")
    .addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                sendRadioMessage();

            }

        }
    );


/* =========================================================
   MIKROFON
========================================================= */

async function requestMic() {

    try {

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices
                .getUserMedia
        ) {

            throw new Error(
                "Mikrofon wird von diesem Browser nicht unterstützt."
            );

        }


        micStream =
            await navigator.mediaDevices
                .getUserMedia({

                    audio: {

                        echoCancellation:
                            true,

                        noiseSuppression:
                            true,

                        autoGainControl:
                            true

                    }

                });


        document.getElementById(
            "micButton"
        ).textContent =
            "🎙 Mikrofon aktiv";


        toast(
            "Mikrofon",
            "Mikrofon wurde freigegeben.",
            "success"
        );


    } catch (error) {

        toast(
            "Mikrofon",
            error.message ||
            "Mikrofonzugriff verweigert.",
            "error"
        );

    }

}


/* =========================================================
   MIKROFON AUFNAHME
========================================================= */

document
    .getElementById(
        "micRecordButton"
    )
    .onclick =
    async () => {

        if (!micStream) {

            await requestMic();

            if (!micStream)
                return;

        }


        if (
            mediaRecorder &&
            mediaRecorder.state ===
            "recording"
        ) {

            mediaRecorder.stop();

            return;

        }


        const chunks = [];


        mediaRecorder =
            new MediaRecorder(
                micStream
            );


        mediaRecorder
            .ondataavailable =
            event => {

                if (
                    event.data &&
                    event.data.size
                ) {

                    chunks.push(
                        event.data
                    );

                }

            };


        mediaRecorder.onstart =
            () => {

                document
                    .getElementById(
                        "micRecordButton"
                    )
                    .classList.add(
                        "recording"
                    );

            };


        mediaRecorder.onstop =
            async () => {

                document
                    .getElementById(
                        "micRecordButton"
                    )
                    .classList.remove(
                        "recording"
                    );


                const blob =
                    new Blob(
                        chunks,
                        {
                            type:
                                "audio/webm"
                        }
                    );


                /*
                 * Die Aufnahme wird hier lokal
                 * erzeugt.
                 *
                 * Für echten Multiplayer-
                 * Sprachfunk braucht man
                 * WebRTC/Voice-Server.
                 */

                const url =
                    URL.createObjectURL(
                        blob
                    );


                const audio =
                    new Audio(url);


                toast(
                    "Funk",
                    "Sprachaufnahme erstellt.",
                    "success"
                );


                /*
                 * Lokale Wiedergabe.
                 */

                audio.play().catch(
                    () => {}
                );

            };


        mediaRecorder.start();

    };


/* =========================================================
   ALARM
========================================================= */

function showAlarm(operation) {

    document.getElementById(
        "alarmText"
    ).textContent =
        `${operation.keyword} — ${operation.address}`;


    document
        .getElementById(
            "alarmOverlay"
        )
        .classList.add("active");


    playAlarm();

}


function closeAlarm() {

    document
        .getElementById(
            "alarmOverlay"
        )
        .classList.remove("active");

}


/* =========================================================
   MELDER-TON
========================================================= */

function playAlarm() {

    const audio =
        new Audio(
            "assets/melder.mp3"
        );


    audio.volume = 1;


    audio.play()
        .catch(error => {

            console.warn(
                "Melder-Ton konnte nicht automatisch abgespielt werden:",
                error
            );

        });

}


/* =========================================================
   KARTE
========================================================= */

function initMap() {

    if (map)
        return;


    map =
        L.map("map")
            .setView(
                [49.415, 11.011],
                12
            );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {

            attribution:
                "&copy; OpenStreetMap-Mitwirkende"

        }
    ).addTo(map);


    updateMap();

}


/* =========================================================
   KARTE AKTUALISIEREN
========================================================= */

function updateMap() {

    if (!map)
        return;


    Object.values(
        vehicleMarkers
    ).forEach(
        marker =>
            marker.remove()
    );


    Object.values(
        operationMarkers
    ).forEach(
        marker =>
            marker.remove()
    );


    vehicleMarkers = {};

    operationMarkers = {};


    vehicles.forEach(
        vehicle => {

            if (
                typeof vehicle.latitude !==
                    "number" ||

                typeof vehicle.longitude !==
                    "number"
            ) {

                return;

            }


            const marker =
                L.marker([

                    vehicle.latitude,

                    vehicle.longitude

                ])
                .addTo(map);


            marker.bindPopup(`

                <strong>

                    🚒
                    ${escapeHTML(
                        vehicle.callsign
                    )}

                </strong>

                <br>

                ${escapeHTML(
                    vehicle.type || ""
                )}

                <br>

                Status:

                ${escapeHTML(
                    vehicle.status ||
                    "Frei"
                )}

            `);


            vehicleMarkers[
                vehicle.id
            ] = marker;

        }
    );


    operations
        .filter(
            operation =>
                operation.status !==
                "Beendet"
        )
        .forEach(
            operation => {

                if (
                    typeof operation.latitude !==
                        "number" ||

                    typeof operation.longitude !==
                        "number"
                ) {

                    return;

                }


                const marker =
                    L.marker([

                        operation.latitude,

                        operation.longitude

                    ])
                    .addTo(map);


                marker.bindPopup(`

                    <strong>

                        🚨
                        ${escapeHTML(
                            operation.keyword
                        )}

                    </strong>

                    <br>

                    ${escapeHTML(
                        operation.address
                    )}

                `);


                operationMarkers[
                    operation.id
                ] = marker;

            }
        );

}


/* =========================================================
   STANDORT
========================================================= */

function locateMe() {

    if (
        !navigator.geolocation
    ) {

        toast(
            "Karte",
            "Geolocation wird nicht unterstützt.",
            "error"
        );

        return;
    }


    navigator.geolocation
        .getCurrentPosition(

            position => {

                const lat =
                    position.coords.latitude;

                const lon =
                    position.coords.longitude;


                if (!map)
                    return;


                map.setView(
                    [lat, lon],
                    16
                );


                L.marker([
                    lat,
                    lon
                ])
                    .addTo(map)
                    .bindPopup(
                        "📍 Mein Standort"
                    )
                    .openPopup();

            },

            error => {

                toast(
                    "Karte",
                    error.message ||
                    "Standort konnte nicht ermittelt werden.",
                    "error"
                );

            }

        );

}


/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {

    const active =
        operations.filter(
            operation =>
                operation.status !==
                "Beendet"
        );


    const free =
        vehicles.filter(
            vehicle =>
                vehicle.status ===
                "Frei"
        );


    document.getElementById(
        "statOperations"
    ).textContent =
        active.length;


    document.getElementById(
        "statVehicles"
    ).textContent =
        vehicles.length;


    document.getElementById(
        "statFreeVehicles"
    ).textContent =
        free.length;


    renderDashboardOperations(
        active
    );


    renderDashboardVehicles();

}


function renderDashboardOperations(
    active
) {

    const container =
        document.getElementById(
            "dashboardOperations"
        );


    container.innerHTML = "";


    active.slice(0,5)
        .forEach(operation => {

            const div =
                document.createElement(
                    "div"
                );


            div.className =
                "list-item";


            div.innerHTML = `

                <div class="list-main">

                    <div class="list-title">

                        🚨
                        ${escapeHTML(
                            operation.keyword
                        )}

                    </div>


                    <div class="list-sub">

                        ${escapeHTML(
                            operation.address
                        )}

                    </div>

                </div>


                <span class="badge red">

                    P${operation.priority || 1}

                </span>

            `;


            container.appendChild(div);

        });


    if (!active.length) {

        container.innerHTML = `

            <div class="list-item">

                <div class="list-main">

                    <div class="list-title">

                        Keine aktiven Einsätze

                    </div>

                    <div class="list-sub">

                        Die Leitstelle ist ruhig.

                    </div>

                </div>

            </div>

        `;

    }

}


function renderDashboardVehicles() {

    const container =
        document.getElementById(
            "dashboardVehicles"
        );


    container.innerHTML = "";


    vehicles.slice(0,5)
        .forEach(vehicle => {

            const div =
                document.createElement(
                    "div"
                );


            div.className =
                "list-item";


            const cls =
                vehicle.status ===
                    "Frei"
                    ? "green"
                    : vehicle.status ===
                        "Einsatz"
                        ? "red"
                        : "yellow";


            div.innerHTML = `

                <div class="list-main">

                    <div class="list-title">

                        🚒
                        ${escapeHTML(
                            vehicle.callsign
                        )}

                    </div>


                    <div class="list-sub">

                        ${escapeHTML(
                            vehicle.type
                        )}

                    </div>

                </div>


                <span
                    class="badge ${cls}">

                    ${escapeHTML(
                        vehicle.status ||
                        "Frei"
                    )}

                </span>

            `;


            container.appendChild(div);

        });


    if (!vehicles.length) {

        container.innerHTML = `

            <div class="list-item">

                <div class="list-main">

                    <div class="list-title">

                        Keine Fahrzeuge

                    </div>

                    <div class="list-sub">

                        Erstelle dein erstes Fahrzeug.

                    </div>

                </div>

            </div>

        `;

    }

}


/* =========================================================
   NAVIGATION
========================================================= */

document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

        button.onclick = () => {

            document
                .querySelectorAll(
                    ".nav-btn"
                )
                .forEach(
                    item =>
                        item.classList
                            .remove(
                                "active"
                            )
                );


            button.classList.add(
                "active"
            );


            document
                .querySelectorAll(
                    ".page"
                )
                .forEach(
                    page =>
                        page.classList
                            .remove(
                                "active"
                            )
                );


            const page =
                document.getElementById(
                    button.dataset.page
                );


            if (page)
                page.classList.add(
                    "active"
                );


            if (
                button.dataset.page ===
                "mapPage"
            ) {

                setTimeout(
                    () => {

                        initMap();

                        if (map) {

                            map.invalidateSize();

                            updateMap();

                        }

                    },
                    100
                );

            }

        };

    });


/* =========================================================
   FIRESTORE HELPER
========================================================= */

function serverCollection(
    collectionName
) {

    if (!currentServer) {

        throw new Error(
            "Kein Server ausgewählt."
        );

    }


    return db
        .collection("servers")
        .doc(currentServer.id)
        .collection(
            collectionName
        );

}


/* =========================================================
   CLEANUP
========================================================= */

function cleanupServerListeners() {

    if (unsubscribePlayers) {

        unsubscribePlayers();

        unsubscribePlayers =
            null;

    }


    if (unsubscribeVehicles) {

        unsubscribeVehicles();

        unsubscribeVehicles =
            null;

    }


    if (unsubscribeOperations) {

        unsubscribeOperations();

        unsubscribeOperations =
            null;

    }


    if (unsubscribeRadio) {

        unsubscribeRadio();

        unsubscribeRadio =
            null;

    }

}


function cleanupListeners() {

    cleanupServerListeners();


    if (unsubscribeServers) {

        unsubscribeServers();

        unsubscribeServers =
            null;

    }

}


/* =========================================================
   TOAST
========================================================= */

function toast(
    title,
    message,
    type = ""
) {

    const container =
        document.getElementById(
            "toastContainer"
        );


    const div =
        document.createElement(
            "div"
        );


    div.className =
        `toast ${type}`;


    div.innerHTML = `

        <strong>
            ${escapeHTML(title)}
        </strong>

        ${escapeHTML(message)}

    `;


    container.appendChild(div);


    setTimeout(
        () => {

            div.remove();

        },
        4500
    );

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
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


/* =========================================================
   MAP NAVIGATION FALLBACK
========================================================= */

window.addEventListener(
    "resize",
    () => {

        if (map) {

            setTimeout(
                () =>
                    map.invalidateSize(),
                100
            );

        }

    }
);


/* =========================================================
   SEITENENDE
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        /*
         * Presence wird zusätzlich
         * durch die Anwendung verwaltet.
         */

        if (
            currentServer &&
            currentUser
        ) {

            db
                .collection("servers")
                .doc(
                    currentServer.id
                )
                .collection("players")
                .doc(
                    currentUser.uid
                )
                .update({

                    online:
                        false,

                    lastSeen:
                        firebase.firestore
                            .FieldValue
                            .serverTimestamp()

                })
                .catch(
                    () => {}
                );

        }

    }
);
