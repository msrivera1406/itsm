import os
import pymysql
from datetime import datetime
from flask import Flask, jsonify, render_template, request

# Configuración de rutas para templates y static
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TEMPLATE_DIR = os.path.join(BASE_DIR, "frontend", "templates")
STATIC_DIR = os.path.join(BASE_DIR, "frontend", "static")

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "db"),
    "user": os.getenv("DB_USER", "asset_user"),
    "password": os.getenv("DB_PASSWORD", "asset_password_123"),
    "database": os.getenv("DB_NAME", "it_asset_db"),
    "cursorclass": pymysql.cursors.DictCursor,
    "autocommit": True
}

def get_db_connection():
    return pymysql.connect(**DB_CONFIG)

MOCK_WAZUH_ALERTS = {
    "003": [
        {
            "cve": "CVE-2022-0815",
            "title": "CVE-2022-0815 affecting WebAdvisor by McAfee",
            "package_name": "WebAdvisor by McAfee",
            "package_version": "4.1.2.122",
            "severity": "Medium",
            "cvss_score": 6.5,
            "status": "Solved",
            "published": "2022-03-10T23:15:08Z",
            "ia_exploit_prob": 12.4
        },
        {
            "cve": "CVE-2024-38063",
            "title": "Windows TCP/IP Remote Code Execution Vulnerability",
            "package_name": "Microsoft Windows 11 Pro",
            "package_version": "10.0.26200.9457",
            "severity": "Critical",
            "cvss_score": 9.8,
            "status": "Active",  
            "published": "2024-08-13T17:00:00Z",
            "ia_exploit_prob": 88.7
        }
    ],
    "004": [
        {
            "cve": "CVE-2023-48795",
            "title": "Terrapin attack on SSH transport protocol",
            "package_name": "openssh-client",
            "package_version": "1:9.6p1",
            "severity": "Medium",
            "cvss_score": 5.9,
            "status": "Solved", 
            "published": "2023-12-18T14:15:00Z",
            "ia_exploit_prob": 3.1
        }
    ]
}

@app.route("/")
@app.route("/devices")
def index_devices():
    return render_template("devices.html")

@app.route("/devices/<agent_id>")
def view_device_detail(agent_id):
    return render_template("device_detail.html", agent_id=agent_id)

@app.route("/api/devices", methods=["GET"])
def get_all_devices():
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Traer dispositivos y verificar si tienen asignación activa
            query = """
                SELECT 
                    d.id, d.agent_id, d.hostname, d.ip_address, d.service_tag,
                    d.cpu_model, d.ram_gb, d.os_name, d.connection_status, d.last_scan,
                    w.warranty_status, w.end_date AS warranty_end,
                    u.full_name AS assigned_to,
                    a.status AS assignment_status
                FROM devices d
                LEFT JOIN dell_warranties w ON d.id = w.device_id
                LEFT JOIN assignments a ON d.id = a.device_id AND a.status = 'ACTIVE'
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY d.id DESC;
            """
            cursor.execute(query)
            devices = cursor.fetchall()
        conn.close()

        # Enriquecer cada dispositivo con conteo de alertas y flag de asignabilidad
        result = []
        for dev in devices:
            agent_id = dev["agent_id"]
            alerts = MOCK_WAZUH_ALERTS.get(agent_id, [])
            
            # Solo cuentan las vulnerabilidades que NO estén "Solved"
            active_cves = [vuln for vuln in alerts if vuln.get("status") != "Solved"]
            
            dev["total_cves"] = len(alerts)
            dev["active_cves_count"] = len(active_cves)
            
            # Cero CVEs activos y no estar ya asignado
            dev["is_assignable"] = (len(active_cves) == 0) and (dev["assignment_status"] != "ACTIVE")
            result.append(dev)

        return jsonify({"status": "success", "data": result}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/devices/<agent_id>", methods=["GET"])
def get_device_detail(agent_id):
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            query = """
                SELECT 
                    d.*,
                    w.warranty_status, w.start_date AS warranty_start,
                    w.end_date AS warranty_end, w.service_level,
                    u.full_name AS assigned_to, u.email AS assigned_email,
                    a.assigned_at, a.status AS assignment_status
                FROM devices d
                LEFT JOIN dell_warranties w ON d.id = w.device_id
                LEFT JOIN assignments a ON d.id = a.device_id AND a.status = 'ACTIVE'
                LEFT JOIN users u ON a.user_id = u.id
                WHERE d.agent_id = %s;
            """
            cursor.execute(query, (agent_id,))
            device = cursor.fetchone()
        conn.close()

        if not device:
            return jsonify({"status": "error", "message": "Dispositivo no encontrado"}), 404

        vulnerabilities = MOCK_WAZUH_ALERTS.get(agent_id, [])
        active_vulns = [v for v in vulnerabilities if v.get("status") != "Solved"]

        # Calcular si es apto para entrega
        is_assignable = (len(active_vulns) == 0) and (device["assignment_status"] != "ACTIVE")

        payload = {
            "device": device,
            "vulnerabilities": vulnerabilities,
            "security_summary": {
                "active_vulnerabilities": len(active_vulns),
                "resolved_vulnerabilities": len(vulnerabilities) - len(active_vulns),
                "is_assignable": is_assignable,
                "block_reason": None if is_assignable else (
                    "Equipo asignado actualmente" if device["assignment_status"] == "ACTIVE" 
                    else f"Bloqueado: Contiene {len(active_vulns)} vulnerabilidad(es) activa(s)"
                )
            }
        }
        return jsonify({"status": "success", "data": payload}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/users/ldap", methods=["GET"])
def search_ldap_users():
    """Búsqueda de empleados para el selector de entrega."""
    query_param = request.args.get("q", "").strip()
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            if query_param:
                sql = "SELECT id, ldap_uid, full_name, email, department FROM users WHERE full_name LIKE %s OR ldap_uid LIKE %s LIMIT 10"
                cursor.execute(sql, (f"%{query_param}%", f"%{query_param}%"))
            else:
                sql = "SELECT id, ldap_uid, full_name, email, department FROM users LIMIT 10"
                cursor.execute(sql)
            users = cursor.fetchall()
        conn.close()
        return jsonify({"status": "success", "data": users}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/assignments", methods=["POST"])
def create_assignment():
    data = request.get_json() or {}
    device_id = data.get("device_id")
    user_id = data.get("user_id")

    if not device_id or not user_id:
        return jsonify({"status": "error", "message": "device_id y user_id son obligatorios"}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT agent_id FROM devices WHERE id = %s", (device_id,))
            dev = cursor.fetchone()
            if not dev:
                conn.close()
                return jsonify({"status": "error", "message": "Dispositivo no encontrado"}), 404

            alerts = MOCK_WAZUH_ALERTS.get(dev["agent_id"], [])
            active_cves = [v for v in alerts if v.get("status") != "Solved"]

            if len(active_cves) > 0:
                conn.close()
                return jsonify({
                    "status": "error",
                    "code": "SECURITY_BLOCK",
                    "message": f"Entrega denegada: El equipo {dev['agent_id']} tiene {len(active_cves)} vulnerabilidad(es) activa(s)."
                }), 422

            insert_sql = "INSERT INTO assignments (device_id, user_id, status) VALUES (%s, %s, 'ACTIVE')"
            cursor.execute(insert_sql, (device_id, user_id))
        conn.close()

        return jsonify({"status": "success", "message": "Dispositivo asignado exitosamente"}), 201

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
@app.route("/assignments")
def view_assignments_page():
    return render_template("assignments.html")

@app.route("/api/assignments", methods=["GET"])
def get_all_assignments():
    """Retorna historial completo de asignaciones con datos de equipo y usuario."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            sql = """
                SELECT 
                    a.id AS assignment_id,
                    a.status,
                    a.assigned_at,
                    a.returned_at,
                    d.id AS device_id,
                    d.hostname,
                    d.service_tag,
                    d.agent_id,
                    u.full_name,
                    u.email,
                    u.department
                FROM assignments a
                INNER JOIN devices d ON a.device_id = d.id
                INNER JOIN users u ON a.user_id = u.id
                ORDER BY a.assigned_at DESC;
            """
            cursor.execute(sql)
            rows = cursor.fetchall()
        conn.close()
        return jsonify({"status": "success", "data": rows}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/assignments/<int:assignment_id>/return", methods=["POST"])
def return_device_assignment(assignment_id):
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, status FROM assignments WHERE id = %s", (assignment_id,))
            current = cursor.fetchone()
            
            if not current:
                conn.close()
                return jsonify({"status": "error", "message": "Asignación no encontrada"}), 404
                
            if current["status"] == "RETURNED":
                conn.close()
                return jsonify({"status": "error", "message": "El equipo ya fue devuelto previamente"}), 400

            update_sql = """
                UPDATE assignments 
                SET status = 'RETURNED', returned_at = NOW() 
                WHERE id = %s;
            """
            cursor.execute(update_sql, (assignment_id,))
        conn.close()
        return jsonify({"status": "success", "message": "Equipo devuelto y liberado con éxito"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
