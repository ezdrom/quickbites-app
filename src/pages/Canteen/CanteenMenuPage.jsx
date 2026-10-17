import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FormField from '../../components/FormField.jsx'
import Button from '../../components/Button.jsx'
import CanteenStatusControl from '../../components/CanteenStatusControl.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import LoadError from '../../components/LoadError.jsx'
import { placeholderMenuItems } from '../../data/placeholderMenuItems.js'
import { allowPlaceholderData } from '../../lib/env.js'

const emptyForm = { name: '', description: '', price: '', servingCount: '' }

function toRow(item) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    serving_count: item.serving_count,
    is_available: item.is_available,
  }
}

export default function CanteenMenuPage() {
  const [authorized, setAuthorized] = useState(null)
  const [demoMode, setDemoMode] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)

  useEffect(() => {
    checkAccessAndLoad()
  }, [])

  // Shared failure handling: sample rows only where placeholder data is allowed
  // (dev/demo); in production show an error + Retry and never fake rows.
  function handleLoadFailure() {
    setLoading(false)
    if (allowPlaceholderData) {
      setDemoMode(true)
      setLoadError(false)
      setItems(placeholderMenuItems.map(toRow))
    } else {
      setDemoMode(false)
      setLoadError(true)
      setItems([])
    }
  }

  async function checkAccessAndLoad() {
    setLoading(true)
    setError('')
    setLoadError(false)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      if (!user) {
        setAuthorized(false)
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      if (!profile || !['canteen', 'admin'].includes(profile.role)) {
        setAuthorized(false)
        setLoading(false)
        return
      }

      setAuthorized(true)
      setDemoMode(false)
      await loadItems()
    } catch (e) {
      console.error('CanteenMenuPage checkAccessAndLoad failed:', e)
      if (allowPlaceholderData) setAuthorized(true)
      handleLoadFailure()
    }
  }

  async function loadItems() {
    setLoading(true)
    setLoadError(false)
    try {
      const { data, error: fetchError } = await supabase
        .from('menu_items')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setLoading(false)
      setDemoMode(false)
      setItems(data)
    } catch (e) {
      console.error('CanteenMenuPage loadItems failed:', e)
      handleLoadFailure()
    }
  }

  async function handleAddSubmit(event) {
    event.preventDefault()
    if (demoMode || loadError) return
    setError('')
    setSubmitting(true)

    try {
      const { error: insertError } = await supabase.from('menu_items').insert({
        name: form.name,
        description: form.description,
        price: Number(form.price),
        serving_count: Number(form.servingCount),
      })

      if (insertError) throw insertError

      setForm(emptyForm)
      await loadItems()
    } catch (e) {
      setError(e.message ?? "Can't reach Supabase right now. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditForm({
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      servingCount: String(item.serving_count),
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(emptyForm)
  }

  async function handleEditSave(id) {
    if (demoMode || loadError) return
    setError('')
    try {
      const { error: updateError } = await supabase
        .from('menu_items')
        .update({
          name: editForm.name,
          description: editForm.description,
          price: Number(editForm.price),
          serving_count: Number(editForm.servingCount),
        })
        .eq('id', id)

      if (updateError) throw updateError

      cancelEdit()
      await loadItems()
    } catch (e) {
      setError(e.message ?? "Can't reach Supabase right now. Please try again.")
    }
  }

  async function handleDelete(id) {
    if (demoMode || loadError) return
    setError('')
    try {
      const { error: deleteError } = await supabase.from('menu_items').delete().eq('id', id)
      if (deleteError) throw deleteError
      await loadItems()
    } catch (e) {
      setError(e.message ?? "Can't reach Supabase right now. Please try again.")
    }
  }

  if (loadError && authorized !== true) {
    return (
      <div className="canteen-page">
        <LoadError onRetry={checkAccessAndLoad} />
      </div>
    )
  }

  if (authorized === null) {
    return (
      <div className="canteen-page">
        <p className="auth-status">Checking access...</p>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="canteen-page">
        <p className="auth-error">You need a canteen or admin account to manage the menu.</p>
        <p className="auth-register-text">
          <Link to="/login" className="auth-inline-link">
            Log in
          </Link>{' '}
          with a canteen account to continue.
        </p>
      </div>
    )
  }

  const formDisabled = demoMode || loadError

  return (
    <div className="canteen-page">
      <div className="canteen-page-header">
        <h1 className="menu-page-title">Manage Menu</h1>
        <Link to="/canteen-orders" className="auth-inline-link">
          View Orders
        </Link>
      </div>

      <CanteenStatusControl />

      {demoMode && (
        <p className="auth-status">
          Showing sample menu items — Supabase isn't reachable, so adding, editing, and deleting are disabled.
        </p>
      )}

      <form className="canteen-form" onSubmit={handleAddSubmit}>
        <FormField
          id="name"
          label="Item Name"
          value={form.name}
          onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
          placeholder="Pork Adobo"
          disabled={formDisabled}
          required
        />
        <FormField
          id="description"
          label="Description"
          value={form.description}
          onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
          placeholder="Short description"
          disabled={formDisabled}
        />
        <FormField
          id="price"
          label="Price"
          type="number"
          value={form.price}
          onChange={(event) => setForm((f) => ({ ...f, price: event.target.value }))}
          placeholder="70"
          disabled={formDisabled}
          required
        />
        <FormField
          id="servingCount"
          label="Servings Today"
          type="number"
          value={form.servingCount}
          onChange={(event) => setForm((f) => ({ ...f, servingCount: event.target.value }))}
          placeholder="50"
          disabled={formDisabled}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <Button type="submit" disabled={submitting || formDisabled}>
          {submitting ? 'Adding...' : 'Add Item'}
        </Button>
      </form>

      <div className="canteen-list">
        {loading ? (
          <p className="auth-status">Loading items...</p>
        ) : loadError ? (
          <LoadError onRetry={loadItems} />
        ) : items.length === 0 ? (
          <p className="auth-status">No menu items yet.</p>
        ) : (
          items.map((item) =>
            editingId === item.id ? (
              <div key={item.id} className="canteen-item canteen-item-editing">
                <FormField
                  id={`edit-name-${item.id}`}
                  label="Item Name"
                  value={editForm.name}
                  onChange={(event) => setEditForm((f) => ({ ...f, name: event.target.value }))}
                  required
                />
                <FormField
                  id={`edit-description-${item.id}`}
                  label="Description"
                  value={editForm.description}
                  onChange={(event) => setEditForm((f) => ({ ...f, description: event.target.value }))}
                />
                <FormField
                  id={`edit-price-${item.id}`}
                  label="Price"
                  type="number"
                  value={editForm.price}
                  onChange={(event) => setEditForm((f) => ({ ...f, price: event.target.value }))}
                  required
                />
                <FormField
                  id={`edit-servingCount-${item.id}`}
                  label="Servings Today"
                  type="number"
                  value={editForm.servingCount}
                  onChange={(event) => setEditForm((f) => ({ ...f, servingCount: event.target.value }))}
                  required
                />
                <div className="canteen-item-actions">
                  <Button variant="gold" onClick={() => handleEditSave(item.id)}>
                    Save
                  </Button>
                  <Button variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div key={item.id} className="canteen-item">
                <div className="canteen-item-info">
                  <p className="canteen-item-name">{item.name}</p>
                  <p className="canteen-item-meta">
                    ₱{item.price} · {item.serving_count} servings ·{' '}
                    {item.is_available ? 'Available' : 'Sold out'}
                  </p>
                </div>
                <div className="canteen-item-actions">
                  <Button variant="outline" onClick={() => startEdit(item)} disabled={formDisabled}>
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => handleDelete(item.id)} disabled={formDisabled}>
                    Delete
                  </Button>
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  )
}
