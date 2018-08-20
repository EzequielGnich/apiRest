const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const User = require('../models/index')

const mailer = require('../../modules/mailer')
const authConfig = require('../../config/auth')
const router = express.Router()

/* Função que configura token de acesso utilizando id, pois
   ele é unico para cada usuario e um secret gerado em md5 */
function generateToken (params = {}) {
  return jwt.sign(params, authConfig.secret, {
    expiresIn: 86400
  })
}
/* -------------------- Fim função ----------------- */

router.post('/register', async (req, res) => {
  const { email } = req.body
  try {
    if (await User.findOne({ email })) {
      return res.status(400).send({ error: 'User already exists' })
    }
    const user = await User.create(req.body)

    // Evita retornar password para o front-end
    user.password = undefined

    return res.send({
      user,
      token: generateToken({ id: user.id })
    })
  } catch (error) {
    return res.status(400).send({ error: 'Registration failed' })
  }
})

router.post('/authenticate', async (req, res) => {
  const { email, password } = req.body

  const user = await User.findOne({ email }).select('+password')

  if (!user) {
    return res.status(400).send({ error: 'User not found' })
  }

  if (!await bcrypt.compare(password, user.password)) {
    return res.status(400).send({ error: 'Invalid password' })
  }

  // Evita retornar password para o front-end
  user.password = undefined

  res.send({
    user,
    token: generateToken({ id: user.id })
  })
})

router.post('/forgot_password', async (req, res) => {
  const { email } = req.body

  try {
    const user = await User.findOne({ email })

    if (!user) return res.status(400).send({ error: 'User not found' })

    const token = crypto.randomBytes(20).toString('hex')

    // Data e tempo de expiração do token
    const now = new Date()
    now.setHours(now.getHours() + 1)

    await User.findByIdAndUpdate(user.id, {
      '$set': {
        passwordResetToken: token,
        passwordResetExpires: now
      }
    })

    mailer.sendMail({
      to: email,
      from: 'forgot_password@mail.com.br',
      template: '/forgot_password',
      context: { token }
    }, (err) => {
      if (err) return res.status(400).send({ error: 'Cannot send forgot password email' })

      res.send()
    })
  } catch (error) {
    res.status(400).send({ error: 'Error on forgot password, try again' })
  }
})

router.post('/reset_password', async (req, res) => {
  const { email, token, password } = req.body

  try {
    const user = await User.findOne({ email })
      .select('+passwordResetToken passwordResetExpires')

    // Verifica se não retorna um usuario na busca
    if (!user) return res.status(400).send({ error: 'User not found' })

    // Verifica se o token enviado é igual ao token registrado
    if (token !== user.passwordResetToken) return res.status(400).send({ error: 'Token invalid' })

    // Verifica se o token não esta expirado
    const now = new Date()
    if (now > user.passwordResetExpires) return res.status(400).send({ error: 'Token expired, generate a new token' })

    user.password = password

    await user.save()

    res.send()
  } catch (error) {
    res.status(400).send({ error: 'Cannot reset password, try again' })
  }
})

module.exports = app => app.use('/auth', router)
