const API = '/api/items'

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export async function fetchItems() {
  const res = await fetch(API)
  return parseJson(res)
}

export async function fetchItem(studentId) {
  const res = await fetch(`${API}/${encodeURIComponent(studentId)}`)
  return parseJson(res)
}

export async function createItem({ student_id, name, age, image }) {
  const form = new FormData()
  form.append('student_id', student_id)
  form.append('name', name)
  form.append('age', String(age))
  if (image) form.append('image', image)
  const res = await fetch(API, { method: 'POST', body: form })
  return parseJson(res)
}

export async function updateItem(studentId, { name, age, image }) {
  const form = new FormData()
  if (name !== undefined) form.append('name', name)
  if (age !== undefined) form.append('age', String(age))
  if (image) form.append('image', image)
  const res = await fetch(`${API}/${encodeURIComponent(studentId)}`, {
    method: 'PUT',
    body: form,
  })
  return parseJson(res)
}

export async function deleteItem(studentId) {
  const res = await fetch(`${API}/${encodeURIComponent(studentId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
}

export async function fetchHealth() {
  const res = await fetch('/health')
  return parseJson(res)
}
