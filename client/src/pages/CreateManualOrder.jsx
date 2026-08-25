import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ManualOrderAddressSection from '../components/ManualOrderAddressSection.jsx';
import ManualOrderProductRow from '../components/ManualOrderProductRow.jsx';
import MasterTotalsEditor from '../components/MasterTotalsEditor.jsx';
import { useManualOrderForm } from '../hooks/useManualOrderForm.js';
import { ORDER_STATUSES } from '../utils/order.js';
import { toDateInputValue, fromDateInputValue } from '../utils/dateFormat.js';

// Create Manual Order (V3.1 — new page, additive; auto-numbered Order
// Number, V5). A second entry point into order creation for orders that
// never arrive as an HTML email. Every field here maps onto the exact same
// parsed_data / resolution_data shapes parseOrderHTML.js + resolveService
// produce; saving goes through POST /api/v1/orders/manual, which assigns
// the 'KS-YYYYMMDD-N' ref server-side — see useManualOrderForm.js. The
// HTML upload page/flow (POST /api/v1/orders) is untouched by this file.
export default function CreateManualOrder() {
  const navigate = useNavigate();
  const form = useManualOrderForm();

  if (form.saved) {
    return (
      <Layout>
        <div className="screen active" id="s-manual-order">
          <div className="mo-success">
            <div className="mo-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2>Order saved</h2>
            <p>Portal Order Ref <b>{form.savedRef}</b> has been created and saved.</p>
            <div className="mo-success-actions">
              <button type="button" className="btn-go" onClick={form.reset}>
                Create Another Manual Order
              </button>
              <button type="button" className="sol-edit-btn" onClick={() => navigate('/search')}>
                View in Search
              </button>
              <button type="button" className="sol-edit-btn" onClick={() => navigate('/')}>
                Back to Upload &amp; Save
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="screen active" id="s-manual-order">
        <div className="mo-top">
          <h2>Create Manual Order</h2>
          <p>For orders that didn&apos;t arrive as an HTML email — saved identically to an uploaded order.</p>
        </div>

        <section className="step-card mo-card">
          <ManualOrderAddressSection
            companyName={form.companyName}
            setCompanyName={form.setCompanyName}
            companySuggestions={form.companySuggestions}
            onSearchCompany={form.searchCompanies}
            onPickCompany={form.pickCompanySuggestion}
            billing={form.billing}
            updateBilling={form.updateBilling}
            sameAsBilling={form.sameAsBilling}
            setSameAsBilling={form.setSameAsBilling}
            delivery={form.delivery}
            updateDelivery={form.updateDelivery}
          />

          <div className="mo-section">
            <div className="mo-section-title">Order Details</div>
            <div className="mo-order-grid">
              <label className="mo-field">
                <span>Order Number</span>
                {form.orderNumberError ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      value="Not generated"
                      readOnly
                      disabled
                      aria-label="Order number (failed to generate)"
                      title={form.orderNumberError}
                    />
                    <button
                      type="button"
                      className="sol-edit-btn"
                      onClick={form.refreshOrderNumberPreview}
                      title={form.orderNumberError}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={form.orderNumberLoading ? 'Generating…' : form.orderNumberPreview}
                    readOnly
                    disabled
                    aria-label="Order number (auto-generated)"
                    title="Assigned automatically — KS-YYYYMMDD-N"
                  />
                )}
              </label>
              <label className="mo-field">
                <span>Order Date</span>
                <input
                  type="date"
                  value={toDateInputValue(form.orderDate)}
                  onChange={(e) => form.setOrderDate(fromDateInputValue(e.target.value))}
                  aria-label="Order date"
                />
              </label>
              <label className="mo-field">
                <span>Delivery Date</span>
                <input
                  type="date"
                  value={toDateInputValue(form.deliveryDate)}
                  onChange={(e) => form.setDeliveryDate(fromDateInputValue(e.target.value))}
                  aria-label="Delivery date"
                />
              </label>
              <label className="mo-field">
                <span>Reference Number</span>
                <input
                  type="text"
                  value={form.referenceNumber}
                  onChange={(e) => form.setReferenceNumber(e.target.value)}
                  aria-label="Reference number"
                />
              </label>
            </div>
            <label className="mo-field mo-notes-field">
              <span>Notes</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => form.setNotes(e.target.value)}
                placeholder="Optional"
                aria-label="Notes"
              />
            </label>
          </div>

          <div className="mo-section">
            <div className="mo-section-title-row">
              <div className="mo-section-title">Products</div>
              <button type="button" className="mo-add-product" onClick={form.addProductRow}>
                + Add Product
              </button>
            </div>
            <div className="mor-list">
              {form.productRows.map((row, i) => (
                <ManualOrderProductRow
                  key={row.id}
                  row={row}
                  index={i}
                  onChange={(patch) => form.updateProductRow(row.id, patch)}
                  onRemove={() => form.removeProductRow(row.id)}
                  canRemove={form.productRows.length > 1}
                  lookupProduct={form.lookupProduct}
                />
              ))}
            </div>
          </div>

          <MasterTotalsEditor
            rows={form.masterTotalRows}
            onAdd={form.addMasterTotalRow}
            onRemove={form.removeMasterTotalRow}
            onUpdate={form.updateMasterTotalRow}
            productsSubtotal={form.productsSubtotal}
            grandTotal={form.grandTotal}
          />

          <div className="os-edit-block" aria-label="Overall order status and comment">
            <div className="os-edit-field">
              <label className="os-edit-label" htmlFor="mo-order-status">Order Status<em>*</em></label>
              <select
                id="mo-order-status"
                className="os-select"
                value={form.orderStatus}
                onChange={(e) => form.setOrderStatus(e.target.value)}
                aria-label="Order Status"
                required
              >
                <option value="" disabled>Select…</option>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="os-edit-field os-edit-field--wide">
              <label className="os-edit-label" htmlFor="mo-order-comment">Order Comment</label>
              <textarea
                id="mo-order-comment"
                className="os-comment-input"
                rows={2}
                placeholder="Optional order-level comment…"
                value={form.orderComment}
                onChange={(e) => form.setOrderComment(e.target.value)}
                aria-label="Order Comment"
              />
            </div>
          </div>
          {form.validationError && <div className="mo-error">{form.validationError}</div>}
          {form.saveError && <div className="mo-error">{form.saveError}</div>}

          <div className="mo-actions">
            <button type="button" className="sol-edit-btn" onClick={() => navigate('/')}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-go"
              onClick={() => form.save()}
              disabled={form.saving}
              title={!ORDER_STATUSES.includes(form.orderStatus) ? 'Select an Order Status before saving' : undefined}
            >
              {form.saving ? 'Saving…' : 'Save Order'}
            </button>
          </div>
        </section>
      </div>
    </Layout>
  );
}
