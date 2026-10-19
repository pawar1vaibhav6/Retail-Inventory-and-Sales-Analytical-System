/* ==========================================================================
   RetailSphere Dynamic Interactive Scripts
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    initPasswordToggle();
    initRegistrationValidation();
    initAjaxLogin();
});

/**
 * Dark / Light Mode Theme Toggle System
 * Features:
 * - Persistent choice in localStorage
 * - System OS preference detection (prefers-color-scheme)
 * - Broadcasts 'themeChanged' CustomEvent for dynamic components (e.g. Chart.js)
 * - Cross-tab synchronization via storage event
 * - Smooth icon switching with proper aria-labels
 */
function initThemeToggle() {
    const themeBtn = document.getElementById("themeToggleBtn");
    const htmlEl = document.documentElement;

    function applyTheme(theme, save = true) {
        htmlEl.setAttribute("data-theme", theme);
        if (save) {
            try {
                localStorage.setItem("retailsphere_theme", theme);
            } catch (e) {}
        }
        updateToggleIcon(theme);
        window.dispatchEvent(new CustomEvent("themeChanged", { detail: { theme } }));
    }

    function updateToggleIcon(theme) {
        if (!themeBtn) return;
        const icon = themeBtn.querySelector("i");
        if (icon) {
            if (theme === "dark") {
                icon.className = "fa-solid fa-sun";
                themeBtn.setAttribute("title", "Switch to light mode");
                themeBtn.setAttribute("aria-label", "Switch to light mode");
            } else {
                icon.className = "fa-solid fa-moon";
                themeBtn.setAttribute("title", "Switch to dark mode");
                themeBtn.setAttribute("aria-label", "Switch to dark mode");
            }
        }
    }

    // Determine current active theme
    const saved = localStorage.getItem("retailsphere_theme");
    const sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const currentTheme = htmlEl.getAttribute("data-theme") || saved || (sysDark ? "dark" : "light");

    applyTheme(currentTheme, false);

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const current = htmlEl.getAttribute("data-theme") || "light";
            const next = current === "dark" ? "light" : "dark";
            applyTheme(next, true);
        });
    }

    // Synchronize across browser tabs
    window.addEventListener("storage", (e) => {
        if (e.key === "retailsphere_theme" && e.newValue) {
            applyTheme(e.newValue, false);
        }
    });

    // Listen to OS system preference changes if user hasn't explicitly set one
    if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
            if (!localStorage.getItem("retailsphere_theme")) {
                applyTheme(e.matches ? "dark" : "light", false);
            }
        });
    }
}

/**
 * Toggle password visibility between hidden and plain text
 */
function initPasswordToggle() {
    const toggleBtn = document.getElementById("togglePasswordBtn");
    const passwordInput = document.getElementById("password");
    const toggleIcon = document.getElementById("togglePasswordIcon");

    if (toggleBtn && passwordInput && toggleIcon) {
        toggleBtn.addEventListener("click", () => {
            const isPassword = passwordInput.getAttribute("type") === "password";
            passwordInput.setAttribute("type", isPassword ? "text" : "password");
            toggleIcon.classList.toggle("fa-eye", !isPassword);
            toggleIcon.classList.toggle("fa-eye-slash", isPassword);
        });
    }
}

/**
 * 1-Click Quick Demo Credentials Filling
 */
function fillCredentials(username, password) {
    const userInput = document.getElementById("username");
    const passInput = document.getElementById("password");
    const alertBox = document.getElementById("dynamic-alert");

    if (userInput && passInput) {
        userInput.value = username;
        passInput.value = password;

        // Visual flash highlight
        userInput.focus();
        passInput.focus();

        if (alertBox) {
            alertBox.className = "alert alert-info";
            alertBox.innerHTML = `
                <div class="alert-content">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Demo credentials for <strong>${username}</strong> auto-filled! Click "Sign In".</span>
                </div>
            `;
            alertBox.classList.remove("d-none");
        }
    }
}

/**
 * Dynamic AJAX Login for seamless submission without full page refresh
 */
function initAjaxLogin() {
    const loginForm = document.getElementById("loginForm");
    const submitBtn = document.getElementById("submitBtn");
    const btnText = document.getElementById("btnText");
    const btnSpinner = document.getElementById("btnSpinner");
    const alertBox = document.getElementById("dynamic-alert");

    if (!loginForm) return;

    loginForm.addEventListener("submit", async (e) => {
        // We handle AJAX login
        e.preventDefault();

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value.trim();

        if (!username || !password) {
            showAlert("Please enter both username and password.", "danger");
            return;
        }

        // Show spinner
        if (submitBtn) submitBtn.disabled = true;
        if (btnText) btnText.classList.add("d-none");
        if (btnSpinner) btnSpinner.classList.remove("d-none");

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                showAlert(data.message + " Redirecting to dashboard...", "success");
                setTimeout(() => {
                    window.location.href = data.redirect || "/dashboard";
                }, 600);
            } else {
                showAlert(data.message || "Invalid credentials.", "danger");
                if (submitBtn) submitBtn.disabled = false;
                if (btnText) btnText.classList.remove("d-none");
                if (btnSpinner) btnSpinner.classList.add("d-none");
            }
        } catch (error) {
            // Fallback to normal form submission if network or server issue
            console.warn("AJAX failed, falling back to standard submit:", error);
            loginForm.submit();
        }
    });

    function showAlert(message, type) {
        if (!alertBox) return;
        alertBox.className = `alert alert-${type}`;
        alertBox.innerHTML = `
            <div class="alert-content">
                <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
                <span>${message}</span>
            </div>
        `;
        alertBox.classList.remove("d-none");
    }
}

/**
 * Registration Form live validation (password matching)
 */
function initRegistrationValidation() {
    const password = document.getElementById("reg-password");
    const confirm = document.getElementById("reg-confirm");
    const msg = document.getElementById("password-match-msg");
    const regBtn = document.getElementById("regSubmitBtn");

    if (password && confirm && msg) {
        const checkMatch = () => {
            if (!confirm.value) {
                msg.classList.add("d-none");
                return;
            }
            msg.classList.remove("d-none");
            if (password.value === confirm.value) {
                msg.innerHTML = '<span class="text-success"><i class="fa-solid fa-check"></i> Passwords match</span>';
                if (regBtn) regBtn.disabled = false;
            } else {
                msg.innerHTML = '<span class="text-danger"><i class="fa-solid fa-xmark"></i> Passwords do not match</span>';
                if (regBtn) regBtn.disabled = true;
            }
        };

        password.addEventListener("input", checkMatch);
        confirm.addEventListener("input", checkMatch);
    }
}

