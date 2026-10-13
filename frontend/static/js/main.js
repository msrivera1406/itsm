let allDevices = [];

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("devicesList")) {
    loadDevices();
    initFilters();
    initSearch();
  } else if (document.getElementById("devHostname")) {
    loadDeviceDetail();
  } else if (document.getElementById("assignmentsList")) {
    loadAssignments();
  }
});

async function loadDevices() {
  try {
    const res = await fetch("/api/devices");
    const json = await res.json();
    if (json.status === "success") {
      allDevices = json.data;
      renderDevices(allDevices);
    }
  } catch (err) {
    console.error("Error cargando dispositivos:", err);
  }
}

function renderDevices(devices) {
  const tbody = document.getElementById("devicesList");
  if (!devices.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 32px;">No se encontraron activos.</td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(d => {
    const isAssigned = d.assignment_status === "ACTIVE";
    let securityBadge = "";
    
    if (d.active_cves_count > 0) {
      securityBadge = `<span class="badge badge-danger"><span class="status-dot"></span>${d.active_cves_count} CVE Activo(s)</span>`;
    } else {
      securityBadge = `<span class="badge badge-safe"><span class="status-dot"></span>Limpio (0 CVEs)</span>`;
    }

    let warrantyDateText = 'N/D';
    if (d.warranty_end) {
      const parsedDate = new Date(d.warranty_end);
      warrantyDateText = isNaN(parsedDate) ? d.warranty_end : parsedDate.toISOString().split('T')[0];
    }

    const warrantyBadge = d.warranty_status === "Active" 
      ? `<span class="badge badge-safe"><span class="status-dot"></span>Vigente (${warrantyDateText})</span>`
      : `<span class="badge badge-warn"><span class="status-dot"></span>Vencida / N/D</span>`;

    const assignedText = isAssigned 
      ? `<span style="font-weight: 700; color: var(--text-main);">${d.assigned_to}</span>` 
      : `<span style="color: var(--text-muted); font-size: 0.85rem;">Disponible</span>`;

    const canAssign = d.is_assignable;
    const assignBtn = isAssigned
      ? `<button class="btn-primary disabled" disabled>Asignado</button>`
      : `<button class="btn-primary ${!canAssign ? 'disabled' : ''}" 
            ${!canAssign ? 'disabled title="Bloqueado por postura de seguridad"' : ''} 
            onclick="openAssignModal(${d.id}, '${d.hostname}', '${d.service_tag}')">
            Asignar
         </button>`;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; font-size: 0.95rem;">${d.hostname}</div>
          <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px;">Tag: <strong>${d.service_tag}</strong> &bull; Agente: ${d.agent_id}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${d.cpu_model || 'N/A'}</div>
          <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px;">${d.ram_gb} GB RAM &bull; ${d.os_name || 'N/A'}</div>
        </td>
        <td class="col-center">${warrantyBadge}</td>
        <td class="col-center">${securityBadge}</td>
        <td class="col-center">${assignedText}</td>
        <td class="col-center">
        <div class="table-actions">
            <a href="/devices/${d.agent_id}" class="btn-secondary">Ver Detalle</a>
            ${assignBtn}
        </div>
        </td>
      </tr>
    `;
  }).join("");
}

function initSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allDevices.filter(d => 
      d.hostname.toLowerCase().includes(q) || 
      d.service_tag.toLowerCase().includes(q)
    );
    renderDevices(filtered);
  });
}

function initFilters() {
  const buttons = document.querySelectorAll(".filter-btn[data-filter]");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.dataset.filter;

      let filtered = allDevices;
      if (filter === "assignable") {
        filtered = allDevices.filter(d => d.is_assignable);
      } else if (filter === "blocked") {
        filtered = allDevices.filter(d => d.active_cves_count > 0);
      } else if (filter === "assigned") {
        filtered = allDevices.filter(d => d.assignment_status === "ACTIVE");
      }
      renderDevices(filtered);
    });
  });
}

async function openAssignModal(deviceId, hostname, serviceTag) {
  document.getElementById("assignDeviceId").value = deviceId;
  document.getElementById("modalDeviceLabel").textContent = `${hostname} (${serviceTag})`;
  document.getElementById("assignmentModal").style.display = "flex";

  const select = document.getElementById("userSelect");
  try {
    const res = await fetch("/api/users/ldap");
    const json = await res.json();
    if (json.status === "success") {
      select.innerHTML = '<option value="">-- Seleccionar colaborador --</option>' + 
        json.data.map(u => `<option value="${u.id}">${u.full_name} (${u.department || 'General'})</option>`).join("");
    }
  } catch (err) {
    select.innerHTML = '<option value="">Error cargando empleados</option>';
  }
}

function closeAssignModal() {
  document.getElementById("assignmentModal").style.display = "none";
}

document.getElementById("assignForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const deviceId = document.getElementById("assignDeviceId").value;
  const userId = document.getElementById("userSelect").value;

  try {
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, user_id: userId })
    });
    const result = await res.json();

    if (res.ok) {
      alert("Equipo asignado con éxito.");
      closeAssignModal();
      loadDevices();
    } else {
      alert(`No se pudo asignar: ${result.message}`);
    }
  } catch (err) {
    alert("Error de red al procesar asignación");
  }
});

async function loadDeviceDetail() {
  const pathParts = window.location.pathname.split("/");
  const agentId = pathParts[pathParts.length - 1];

  try {
    const res = await fetch(`/api/devices/${agentId}`);
    const json = await res.json();
    if (json.status !== "success") return;

    const { device, vulnerabilities, security_summary } = json.data;

    document.getElementById("devHostname").textContent = device.hostname;
    document.getElementById("devSubinfo").textContent = `Service Tag: ${device.service_tag} | IP: ${device.ip_address} | SO: ${device.os_name}`;

    const gateContainer = document.getElementById("assignGateBadge");
    if (security_summary.is_assignable) {
      gateContainer.innerHTML = `<span class="badge badge-safe" style="padding: 8px 14px; font-size: 0.85rem;"><span class="status-dot"></span>Apto para Entrega</span>`;
    } else {
      gateContainer.innerHTML = `<span class="badge badge-danger" style="padding: 8px 14px; font-size: 0.85rem;"><span class="status-dot"></span>${security_summary.block_reason}</span>`;
    }

    const specs = document.getElementById("specsContainer");
    specs.innerHTML = `
      <div class="spec-item"><div class="spec-label">Procesador</div><div class="spec-val">${device.cpu_model || 'N/D'}</div></div>
      <div class="spec-item"><div class="spec-label">Memoria RAM</div><div class="spec-val">${device.ram_gb} GB</div></div>
      <div class="spec-item"><div class="spec-label">Garantía Dell</div><div class="spec-val">${device.warranty_status} (${device.warranty_end || 'N/A'})</div></div>
      <div class="spec-item"><div class="spec-label">Nivel de Servicio Dell</div><div class="spec-val">${device.service_level || 'Estándar'}</div></div>
    `;

    const vulnList = document.getElementById("vulnList");
    if (!vulnerabilities.length) {
      vulnList.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--accent-safe-text); padding: 24px;">No se registraron vulnerabilidades reportadas por Wazuh.</td></tr>`;
      return;
    }

    vulnList.innerHTML = vulnerabilities.map(v => {
      const isSolved = v.status === "Solved";
      const statusBadge = isSolved
        ? `<span class="badge badge-neutral">Resuelta (Ignorada)</span>`
        : `<span class="badge badge-danger">Activa (Bloqueante)</span>`;

      const prob = v.ia_exploit_prob || 0;
      const probColor = prob > 50 ? 'var(--accent-danger-text)' : 'var(--text-main)';

      return `
        <tr>
          <td><div style="font-weight: 600;">${v.cve}</div><div style="font-size: 0.75rem; color: var(--text-muted);">${v.title}</div></td>
          <td>${v.package_name} <span style="font-size: 0.75rem; color: var(--text-muted);">${v.package_version}</span></td>
          <td class="col-center"><span class="badge ${v.severity === 'Critical' ? 'badge-danger' : 'badge-warn'}">${v.severity}</span></td>
          <td class="col-center"><strong>${v.cvss_score}</strong></td>
          <td class="col-center" style="color: ${probColor}; font-weight: 700;">${prob}%</td>
          <td class="col-center">${statusBadge}</td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Error cargando detalle:", err);
  }
}

let allAssignments = [];

async function loadAssignments() {
  try {
    const res = await fetch("/api/assignments");
    const json = await res.json();
    if (json.status === "success") {
      allAssignments = json.data;
      renderAssignments(allAssignments);
      initAssignmentFilters();
      initAssignmentSearch();
    }
  } catch (err) {
    console.error("Error cargando asignaciones:", err);
  }
}

function renderAssignments(list) {
  const tbody = document.getElementById("assignmentsList");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 32px;">No hay registros de asignaciones.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(a => {
    const isActive = a.status === "ACTIVE";
    const statusBadge = isActive
      ? `<span class="badge badge-safe"><span class="status-dot"></span>En Uso (Activa)</span>`
      : `<span class="badge badge-neutral">Devuelta</span>`;

    const returnBtn = isActive
      ? `<button class="btn-primary" style="background: #0284c7; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);" onclick="returnDevice(${a.assignment_id})">
           Liberar Equipo
         </button>`
      : `<span style="color: var(--text-muted); font-size: 0.8rem;">Completada</span>`;

    const assignedDate = a.assigned_at ? a.assigned_at.replace("T", " ").slice(0, 16) : 'N/D';
    const returnedDate = a.returned_at ? a.returned_at.replace("T", " ").slice(0, 16) : '-';

    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${a.hostname}</div>
          <div style="font-size: 0.76rem; color: var(--text-muted);">Tag: ${a.service_tag} | Agente: ${a.agent_id}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${a.full_name}</div>
          <div style="font-size: 0.76rem; color: var(--text-muted);">${a.email} &bull; ${a.department || 'General'}</div>
        </td>
        <td class="col-center">${statusBadge}</td>
        <td class="col-center" style="color: var(--text-muted);">${returnedDate}</td>
        <td class="col-center">
        <div class="table-actions">
            ${returnBtn}
        </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function returnDevice(assignmentId) {
  if (!confirm("¿Deseas registrar la devolución de este equipo? Pasará a estar disponible en el inventario.")) {
    return;
  }

  try {
    const res = await fetch(`/api/assignments/${assignmentId}/return`, { method: "POST" });
    const json = await res.json();
    if (res.ok) {
      alert("✅ " + json.message);
      loadAssignments();
    } else {
      alert("❌ " + json.message);
    }
  } catch (err) {
    alert("Error de conexión al liberar el equipo.");
  }
}

function initAssignmentFilters() {
  const buttons = document.querySelectorAll("[data-assign-filter]");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const f = btn.dataset.assignFilter;
      let filtered = allAssignments;
      if (f === "active") filtered = allAssignments.filter(x => x.status === "ACTIVE");
      if (f === "returned") filtered = allAssignments.filter(x => x.status === "RETURNED");
      renderAssignments(filtered);
    });
  });
}

function initAssignmentSearch() {
  const input = document.getElementById("searchAssignInput");
  input?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allAssignments.filter(x => 
      x.full_name.toLowerCase().includes(q) ||
      x.hostname.toLowerCase().includes(q) ||
      x.service_tag.toLowerCase().includes(q)
    );
    renderAssignments(filtered);
  });
}