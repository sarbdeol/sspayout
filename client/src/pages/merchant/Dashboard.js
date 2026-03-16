import React, { useEffect, useState } from "react";
import { merchantAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import StatusBadge, {
  formatAmount,
  formatDate,
} from "../../components/shared/StatusBadge";

export default function MerchantDashboard() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [utrModal, setUtrModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [form, setForm] = useState({ amount: "" });
  const [utr, setUtr] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newPayment, setNewPayment] = useState(null);

  const merchant = user?.merchant;

  const load = () => {
    Promise.all([
      merchantAPI.getBalance(),
      merchantAPI.getPayments({ limit: 8 }),
    ])
      .then(([b, p]) => {
        setBalance(b.data.balance);
        setPayments(p.data.payments);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Auto refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      load();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async () => {
    if (!form.amount) {
      setError("Amount is required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const auto_order_id = `ORD-${Date.now()}`;
      const res = await merchantAPI.createPayment({
        ...form,
        order_id: auto_order_id,
      });
      setNewPayment(res.data.payment);
      setForm({ amount: "" });
      setCreateModal(false);
      setUtrModal(true);
      setSelectedPayment(res.data.payment);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create payment");
    } finally {
      setSaving(false);
    }
  };

  const handleUTR = async () => {
    if (!utr) {
      setError("Enter UTR number");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await merchantAPI.submitUTR(selectedPayment.id, { utr });
      setUtrModal(false);
      setUtr("");
      setSelectedPayment(null);
      setNewPayment(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit UTR");
    } finally {
      setSaving(false);
    }
  };

  const openUTR = (payment) => {
    setSelectedPayment(payment);
    setUtr("");
    setError("");
    setUtrModal(true);
  };

  const confirmedPayments = payments.filter(
    (p) => p.status === "confirmed",
  ).length;
  const pendingPayments = payments.filter((p) =>
    ["pending", "awaiting_transfer", "utr_submitted"].includes(p.status),
  ).length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Dashboard</div>
            <div className="page-subtitle">
              Welcome back, {merchant?.merchant_name}
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setForm({ amount: "" });
              setError("");
              setCreateModal(true);
            }}
          >
            + New Payment
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card success">
          <div className="stat-icon">₹</div>
          <div className="stat-label">Available Balance</div>
          <div className="stat-value" style={{ fontSize: 22 }}>
            {formatAmount(balance)}
          </div>
          <div className="stat-sub">Ready for settlement</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">⏳</div>
          <div className="stat-label">Pending</div>
          <div className="stat-value">{pendingPayments}</div>
          <div className="stat-sub">Awaiting confirmation</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">✓</div>
          <div className="stat-label">Confirmed</div>
          <div className="stat-value">{confirmedPayments}</div>
          <div className="stat-sub">Successfully processed</div>
        </div>
      </div>

      {/* API Key Box */}
      {merchant?.api_key && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "16px 20px",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                🔑 Your API Key
              </div>
              <div
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: 13,
                  color: "var(--accent)",
                }}
              >
                {merchant?.api_key}
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(merchant?.api_key);
                alert("API Key copied!");
              }}
            >
              Copy
            </button>
          </div>
          <div
            style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}
          >
            Integration endpoint:
            <code
              style={{
                fontFamily: "DM Mono, monospace",
                background: "var(--bg-hover)",
                padding: "2px 8px",
                borderRadius: 4,
                marginLeft: 6,
                fontSize: 11,
                color: "var(--text-secondary)",
              }}
            >
              POST https://ss.sspay.online/api/payin
            </code>
          </div>
        </div>
      )}

      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Recent Transactions
          </div>
          <a href="/merchant/payments" className="btn btn-secondary btn-sm">
            View All
          </a>
        </div>
        {loading ? (
          <div className="loading-overlay">
            <div className="spinner"></div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Amount</th>
                  <th>Bank Details</th>
                  <th>UTR</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <div className="empty-state-icon">⇄</div>
                        <div className="empty-state-text">
                          No payments yet. Create your first payment!
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td
                        className="td-primary"
                        style={{
                          fontFamily: "DM Mono, monospace",
                          fontSize: 12,
                        }}
                      >
                        {p.order_id}
                      </td>
                      <td className="amount">{formatAmount(p.amount)}</td>
                      <td style={{ fontSize: 12 }}>
                        {p.bank_name ? (
                          <>
                            <div>{p.bank_name}</div>
                            <div
                              style={{
                                fontFamily: "DM Mono, monospace",
                                color: "var(--text-muted)",
                              }}
                            >
                              {p.account_number}
                            </div>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td
                        style={{
                          fontFamily: "DM Mono, monospace",
                          fontSize: 11,
                        }}
                      >
                        {p.utr || "-"}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>{formatDate(p.created_at)}</td>
                      <td>
                        {p.status === "awaiting_transfer" && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => openUTR(p)}
                          >
                            Submit UTR
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Payment Modal */}
      {createModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setCreateModal(false)}
        >
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Create Payment Request</div>
              <button
                className="modal-close"
                onClick={() => setCreateModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">Amount (₹)</label>
                <input
                  className="form-control"
                  type="number"
                  placeholder="1000.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setCreateModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? "Creating..." : "Get Bank Details"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UTR Modal */}
      {utrModal && selectedPayment && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Transfer & Submit UTR</div>
              <button
                className="modal-close"
                onClick={() => {
                  setUtrModal(false);
                  setNewPayment(null);
                  setSelectedPayment(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              {selectedPayment.bank_name ? (
                <div
                  style={{
                    background: "var(--bg-hover)",
                    borderRadius: "var(--radius-sm)",
                    padding: "16px",
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      marginBottom: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Transfer To
                  </div>
                  <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>Bank:</span>
                      <strong>{selectedPayment.bank_name}</strong>
                    </div>
                    {selectedPayment.account_holder_name && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          Account Name:
                        </span>
                        <strong>{selectedPayment.account_holder_name}</strong>
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>
                        Account:
                      </span>
                      <strong style={{ fontFamily: "DM Mono, monospace" }}>
                        {selectedPayment.account_number}
                      </strong>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>IFSC:</span>
                      <strong style={{ fontFamily: "DM Mono, monospace" }}>
                        {selectedPayment.ifsc}
                      </strong>
                    </div>
                    {selectedPayment.upi_id && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          UPI ID:
                        </span>
                        <strong
                          style={{
                            fontFamily: "DM Mono, monospace",
                            color: "var(--accent)",
                          }}
                        >
                          {selectedPayment.upi_id}
                        </strong>
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>
                        Amount:
                      </span>
                      <strong className="amount-positive">
                        {formatAmount(selectedPayment.amount)}
                      </strong>
                    </div>
                  </div>
                  {selectedPayment.qr_code && (
                    <div
                      style={{
                        textAlign: "center",
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginBottom: 8,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Scan UPI QR to Pay
                      </div>
                      <img
                        src={selectedPayment.qr_code}
                        alt="UPI QR Code"
                        style={{
                          width: 160,
                          height: 160,
                          borderRadius: 8,
                          background: "white",
                          padding: 8,
                        }}
                      />
                      {selectedPayment.upi_id && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: "var(--accent)",
                            fontFamily: "DM Mono, monospace",
                          }}
                        >
                          {selectedPayment.upi_id}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="alert alert-error" style={{ marginBottom: 20 }}>
                  ⚠️ Bank details not received from agent. Please contact
                  support.
                </div>
              )}
              <div className="form-group">
                <label className="form-label">
                  Transaction UTR / Reference Number
                </label>
                <input
                  className="form-control"
                  placeholder="Enter UTR after transfer"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                  style={{ fontFamily: "DM Mono, monospace" }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setUtrModal(false);
                  setNewPayment(null);
                  setSelectedPayment(null);
                }}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUTR}
                disabled={saving || !selectedPayment.bank_name}
              >
                {saving ? "Submitting..." : "Submit UTR"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
