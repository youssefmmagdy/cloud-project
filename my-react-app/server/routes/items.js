import { Router } from 'express'
import multer from 'multer'
import * as items from '../itemsService.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const router = Router()

function parseAge(value) {
  const age = Number(value)
  if (!Number.isInteger(age) || age < 0 || age > 150) {
    return null
  }
  return age
}

router.get('/', async (_req, res) => {
  try {
    const data = await items.listItems()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:student_id', async (req, res) => {
  try {
    const item = await items.getItem(req.params.student_id)
    if (!item) return res.status(404).json({ error: 'Student not found' })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { student_id, name, age } = req.body
    if (!student_id?.trim()) {
      return res.status(400).json({ error: 'student_id is required' })
    }
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' })
    }
    const parsedAge = parseAge(age)
    if (parsedAge === null) {
      return res.status(400).json({ error: 'age must be a whole number between 0 and 150' })
    }

    const item = await items.createItem(
      {
        student_id: student_id.trim(),
        name: name.trim(),
        age: parsedAge,
      },
      req.file,
    )
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:student_id', upload.single('image'), async (req, res) => {
  try {
    const { name, age } = req.body
    const parsedAge = age !== undefined && age !== '' ? parseAge(age) : undefined
    if (age !== undefined && age !== '' && parsedAge === null) {
      return res.status(400).json({ error: 'age must be a whole number between 0 and 150' })
    }

    const item = await items.updateItem(
      req.params.student_id,
      {
        name: name !== undefined ? name.trim() : undefined,
        age: parsedAge,
      },
      req.file,
    )
    if (!item) return res.status(404).json({ error: 'Student not found' })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:student_id', async (req, res) => {
  try {
    const deleted = await items.deleteItem(req.params.student_id)
    if (!deleted) return res.status(404).json({ error: 'Student not found' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
