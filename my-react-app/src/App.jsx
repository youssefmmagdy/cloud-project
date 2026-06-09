import { useCallback, useEffect, useState } from 'react'
import {
  createItem,
  deleteItem,
  fetchHealth,
  fetchItems,
  updateItem,
} from './api'
import './App.css'

const emptyForm = { student_id: '', name: '', age: '', image: null }

function App() {
  const [items, setItems] = useState([])
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, healthData] = await Promise.all([fetchItems(), fetchHealth()])
      setItems(list)
      setHealth(healthData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (!editingId && !form.student_id.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const age = Number(form.age)
      if (!Number.isInteger(age) || age < 0 || age > 150) {
        throw new Error('Age must be a whole number between 0 and 150')
      }

      if (editingId) {
        await updateItem(editingId, {
          name: form.name.trim(),
          age,
          image: form.image,
        })
      } else {
        await createItem({
          student_id: form.student_id.trim(),
          name: form.name.trim(),
          age,
          image: form.image,
        })
      }
      resetForm()
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(item) {
    setEditingId(item.student_id)
    setForm({
      student_id: item.student_id,
      name: item.name,
      age: String(item.age),
      image: null,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(studentId) {
    if (!confirm('Delete this student and all their images?')) return
    setError(null)
    try {
      await deleteItem(studentId)
      if (editingId === studentId) resetForm()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Student Registry</h1>
        <p className="subtitle">DynamoDB: student_id · name · age</p>
        {health && (
          <p className="health-line">
            API: {health.status} · table: {health.table} · bucket:{' '}
            {health.bucket}
          </p>
        )}
      </header>

      {error && <div className="banner error">{error}</div>}

      <section className="panel">
        <h2>{editingId ? 'Edit student' : 'Add student'}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Student ID *
            <input
              value={form.student_id}
              onChange={(e) =>
                setForm({ ...form, student_id: e.target.value })
              }
              required
              disabled={!!editingId}
            />
          </label>
          <label>
            Name *
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Age *
            <input
              type="number"
              min={0}
              max={150}
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              required
            />
          </label>
          <label>
            Photo {editingId && '(keeps previous versions)'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setForm({ ...form, image: e.target.files?.[0] || null })
              }
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Students ({items.length})</h2>
        {loading && <p>Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="empty">No students yet. Add one above.</p>
        )}
        <ul className="item-list">
          {items.map((item) => (
            <li key={item.student_id} className="item-card">
              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.name} className="thumb" />
              )}
              <div className="item-body">
                <h3>{item.name}</h3>
                <p>
                  <strong>ID:</strong> {item.student_id}
                </p>
                <p>
                  <strong>Age:</strong> {item.age}
                </p>
                {item.imageUrls?.length > 1 && (
                  <p className="meta">
                    {item.imageUrls.length} photo versions stored
                  </p>
                )}
                <div className="item-actions">
                  <button type="button" onClick={() => startEdit(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => handleDelete(item.student_id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default App
