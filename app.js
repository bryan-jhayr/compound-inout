
const SUPABASE_URL = "https://lzmvvqqygegwmijirovt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xweQ4dGsggg1Qy0zoNYXAQ_oKvq_fSn";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const publicSection = document.getElementById("publicSection");
const publicOutList = document.getElementById("publicOutList");
const publicMessage = document.getElementById("publicMessage");
const googleLoginButton = document.getElementById("googleLoginButton");
const signOutButton = document.getElementById("signOutButton");
const loginMessage = document.getElementById("loginMessage");
const signedInAs = document.getElementById("signedInAs");

let currentUser = null;
let members = [];
let activities = [];
let refreshInProgress = false;
let refreshTimer = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatTime(timestamp) {
  if (!timestamp) return "No status update yet";

  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getStatusClass(status) {
  if (status === "IN") return "in";
  if (status === "OUT") return "out";
  return "unknown";
}


function showLogin(message = "Sign in to update statuses.") {
  currentUser = null;
  members = [];
  activities = [];

  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  loginSection.hidden = false;
  dashboardSection.hidden = true;
  publicSection.hidden = false;

  loginMessage.textContent = message;
  googleLoginButton.disabled = false;

  document.getElementById("memberList").innerHTML = "";
  document.getElementById("activityList").innerHTML = "";

  loadPublicOutMembers();
}

async function loadPublicOutMembers() {
  publicMessage.textContent = "Loading current status...";
  publicOutList.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("members")
    .select("name, status")
    .eq("status", "OUT");

  if (error) {
    console.error("Could not load public OUT list:", error);
    publicMessage.textContent =
      "Could not load the OUT list. Please refresh the page.";
    return;
  }

  if (!data || data.length === 0) {
    publicMessage.textContent = "No household members are currently marked OUT.";
    return;
  }

  publicOutList.innerHTML = data.map(member => `
    <article class="member-card">
      <div class="member-info">
        <h3>${escapeHTML(member.name)}</h3>
        <span class="status-badge out">OUT</span>
      </div>
    </article>
  `).join("");

  publicMessage.textContent =
    "View only. Sign in with an approved Google account to update statuses.";
}

function showDashboard(user) {
  currentUser = user;
  loginSection.hidden = true;
  publicSection.hidden = true;
  dashboardSection.hidden = false;
  signedInAs.textContent =
    `Signed in as ${user.email || "household member"}`;
}


async function signInWithGoogle() {
  googleLoginButton.disabled = true;
  loginMessage.textContent = "Opening Google sign-in...";

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://bryan-jhayr.github.io/compound-inout/"
    }
  });

  if (error) {
    console.error("Google sign-in error:", error);
    loginMessage.textContent = "Could not start Google sign-in: " + error.message;
    googleLoginButton.disabled = false;
  }
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Sign-out error:", error);
    alert("Could not sign out. Please try again.");
    return;
  }

  showLogin("You have signed out.");
}

async function checkHouseholdApproval(user) {
  const { data, error } = await supabaseClient.rpc(
    "is_household_approved"
  );

  if (error) {
    console.error("Approval check failed:", error);
    showLogin(
      "We couldn't verify this account. Check your connection and Supabase settings, then sign in again."
    );
    return false;
  }

  if (data !== true) {
    await supabaseClient.auth.signOut();
    showLogin(
      "This Google account is not approved for this household. Ask the household administrator to add its email."
    );
    return false;
  }

  showDashboard(user);
  return true;
}

async function loadMembers() {
  const { data, error } = await supabaseClient
    .from("members")
    .select("id, name, status, updated_at, updated_by")
    .order("id", { ascending: true });

  if (error) throw error;

  members = data || [];
}

async function loadActivities() {
  const { data, error } = await supabaseClient
    .from("activity_log")
    .select("id, member_id, member_name, status, changed_at, changed_by")
    .order("changed_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  activities = data || [];
}

function renderSummary() {
  document.getElementById("insideCount").textContent =
    members.filter(member => member.status === "IN").length;

  document.getElementById("outsideCount").textContent =
    members.filter(member => member.status === "OUT").length;

  document.getElementById("unknownCount").textContent =
    members.filter(member => member.status === "Unknown").length;
}

function renderMembers() {
  const memberList = document.getElementById("memberList");

  if (members.length === 0) {
    memberList.innerHTML = "<p>No household members were found.</p>";
    return;
  }

  memberList.innerHTML = members.map(member => {
    const status = member.status || "Unknown";
    const statusClass = getStatusClass(status);
    const lastUpdated = member.updated_at
      ? `Updated ${formatTime(member.updated_at)}`
      : "No status update yet";

    const updater = member.updated_by
      ? ` · By ${escapeHTML(member.updated_by)}`
      : "";

    return `
      <article class="member-card">
        <div class="member-info">
          <h3>${escapeHTML(member.name)}</h3>
          <span class="status-badge ${statusClass}">
            ${escapeHTML(status)}
          </span>
          <p>${lastUpdated}${updater}</p>
        </div>

        <div class="member-actions">
          <button
            type="button"
            data-member-id="${escapeHTML(member.id)}"
            data-status="IN"
            ${status === "IN" ? "disabled" : ""}
          >IN</button>

          <button
            type="button"
            data-member-id="${escapeHTML(member.id)}"
            data-status="OUT"
            ${status === "OUT" ? "disabled" : ""}
          >OUT</button>

          <button
            type="button"
            data-member-id="${escapeHTML(member.id)}"
            data-status="Unknown"
            ${status === "Unknown" ? "disabled" : ""}
          >Unknown</button>
        </div>
      </article>
    `;
  }).join("");

  memberList.querySelectorAll("button[data-member-id]").forEach(button => {
    button.addEventListener("click", async () => {
      await updateStatus(
        button.dataset.memberId,
        button.dataset.status
      );
    });
  });
}

function renderActivities() {
  const activityList = document.getElementById("activityList");

  if (activities.length === 0) {
    activityList.innerHTML = "<p>No activity recorded yet.</p>";
    return;
  }

  activityList.innerHTML = activities.map(activity => `
    <article class="activity-item">
      <div>
        <strong>${escapeHTML(activity.member_name)}</strong>
        <span> changed to </span>
        <strong>${escapeHTML(activity.status)}</strong>
      </div>
      <p>
        ${formatTime(activity.changed_at)}
        ${activity.changed_by
          ? ` · By ${escapeHTML(activity.changed_by)}`
          : ""}
      </p>
    </article>
  `).join("");
}

function renderApp() {
  renderMembers();
  renderSummary();
  renderActivities();
}

async function refreshData() {
  if (!currentUser || refreshInProgress) return;

  refreshInProgress = true;

  try {
    await Promise.all([loadMembers(), loadActivities()]);
    renderApp();
  } catch (error) {
    console.error("Could not refresh household data:", error);
  } finally {
    refreshInProgress = false;
  }
}

async function updateStatus(memberId, newStatus) {
  if (!currentUser) {
    showLogin("Please sign in again.");
    return;
  }

  const member = members.find(item => String(item.id) === String(memberId));
  if (!member || member.status === newStatus) return;

  const previousStatus = member.status;
  const timestamp = new Date().toISOString();
  const userId = currentUser.id;
  const userEmail = currentUser.email || "Household member";

  try {
    const { data, error } = await supabaseClient
      .from("members")
      .update({
        status: newStatus,
        updated_at: timestamp,
        updated_by: userEmail,
        updated_by_user_id: userId
      })
      .eq("id", member.id)
      .select("id");

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        "No member was updated. Check the household approval and database policies."
      );
    }

    /*const { error: activityError } = await supabaseClient
      .from("activity_log")
      .insert({
        member_id: member.id,
        member_name: member.name,
        status: newStatus,
        changed_at: timestamp,
        changed_by: userEmail,
        changed_by_user_id: userId
      });

    if (activityError) {
      console.error("Status updated, but activity logging failed:", activityError);
      alert("The status changed, but its activity entry could not be saved.");
    }*/

    await refreshData();
  } catch (error) {
    console.error("Could not update status:", error);
    alert(
      `Could not update ${member.name}'s status.\n\n${error.message}`
    );

    // Reload in case the server accepted the update despite a connection issue.
    await refreshData();
  }
}

async function handleSignedInUser(user) {
  if (!user) {
    showLogin();
    return;
  }

  loginMessage.textContent = "Checking household access...";
  const approved = await checkHouseholdApproval(user);

  if (!approved) return;

  try {
    await refreshData();

    if (!refreshTimer) {
      // Check for changes made by other household members every 5 seconds.
      refreshTimer = setInterval(refreshData, 5000);
    }
  } catch (error) {
    console.error("Initial data load failed:", error);
    alert("You signed in, but the household data could not be loaded. Check the browser console for details.");
  }
}

googleLoginButton.addEventListener("click", signInWithGoogle);
signOutButton.addEventListener("click", signOut);

async function startApp() {
  showLogin("Checking your sign-in...");

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Could not check session:", error);
    showLogin("Could not check your sign-in. Refresh the page and try again.");
    return;
  }

  await handleSignedInUser(data.session?.user || null);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      showLogin();
      return;
    }

    if (event === "SIGNED_IN" && session?.user) {
      // Defer Supabase queries until the auth callback has finished.
      setTimeout(() => handleSignedInUser(session.user), 0);
    }
  });
}

startApp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("App support enabled"))
      .catch(error => {
        console.error("Service worker registration failed:", error);
      });
  });
}   
