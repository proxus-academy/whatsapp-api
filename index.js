const express = require('express');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs'); // Import for handling file system operations

const app = express();
const port = 3000;
const secretPassword = 'tu-contraseña'; // Contraseña para mostrar el QR
const apiSecret = 'tu-api-secret'; // Secreto para las peticiones a la API

let sock;
let qrCodeBase64 = ''; // Variable para almacenar el QR en base64
let connectionStatus = 'Desconectado'; // Estado inicial de la conexión

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // No imprimimos el QR en la terminal
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            // Generar QR en base64
            qrcode.toDataURL(qr, (err, url) => {
                if (err) {
                    console.error('Error al generar QR:', err);
                    return;
                }
                console.log('QR generado correctamente:', url);
                qrCodeBase64 = url; // Guardar el QR en base64
            });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada debido a', lastDisconnect?.error, ', reconectando', shouldReconnect);
            connectionStatus = 'Desconectado';
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Conexión abierta con WhatsApp');
            connectionStatus = 'Conectado';
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Inicializar la conexión
connectToWhatsApp();

// Ruta principal para mostrar el estado de la conexión y opciones
app.get('/', (req, res) => {
    if (connectionStatus === 'Desconectado') {
        res.send(`
            <html>
                <body>
                    <h1>Estado de la conexión: ${connectionStatus}</h1>
                    <form method="POST" action="/get-qr">
                        <label>Contraseña:</label>
                        <input type="password" name="password" />
                        <button type="submit">Obtener QR</button>
                    </form>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <body>
                    <h1>Estado de la conexión: ${connectionStatus}</h1>
                    <form method="POST" action="/logout">
                        <button type="submit">Cerrar sesión</button>
                    </form>
                </body>
            </html>
        `);
    }
});

// Ruta para mostrar el QR después de ingresar la contraseña
app.post('/get-qr', (req, res) => {
    const { password } = req.body;

    if (password === secretPassword && connectionStatus === 'Desconectado') {
        if (qrCodeBase64) {
            res.send(`
                <html>
                    <body>
                        <h1>Escanea este código QR para autenticar con WhatsApp</h1>
                        <img src="${qrCodeBase64}" alt="QR Code" />
                    </body>
                </html>
            `);
        } else {
            res.send('<h1>El código QR aún no está disponible. Intenta nuevamente más tarde.</h1>');
        }
    } else {
        res.status(403).send('<h1>Contraseña incorrecta o ya conectado</h1>');
    }
});


app.post('/logout', async (req, res) => {
    if (connectionStatus === 'Conectado') {
        try {
            // Cerrar sesión correctamente
            await sock.logout();
            connectionStatus = 'Desconectado';

            // Eliminar los archivos de autenticación
            const authFolder = 'auth_info_baileys';
            fs.rmSync(authFolder, { recursive: true, force: true });

            // Reiniciar Baileys desde cero
            sock = null; // Limpiar el socket
            qrCodeBase64 = ''; // Limpiar el QR generado

            // Forzar la creación de un nuevo socket con un nuevo estado limpio
            await connectToWhatsApp();

            res.send('<h1>Sesión cerrada y archivos de autenticación eliminados con éxito. Nuevo QR generado</h1><a href="/">Volver</a>');
        } catch (err) {
            console.error('Error al cerrar sesión:', err);
            res.status(500).send(`<h1>Error al cerrar sesión: ${err.message}</h1>`);
        }
    } else {
        res.status(400).send('<h1>No hay sesión activa</h1>');
    }
});


// Ruta para enviar un mensaje
app.post('/send-message', async (req, res) => {
    const { number, message, secret } = req.body;

    if (secret !== apiSecret) {
        return res.status(403).json({ error: 'Acceso denegado: Secret inválido' });
    }

    if (!number || !message) {
        return res.status(400).json({ error: 'Número y mensaje son requeridos' });
    }

    try {
        const id = `${number}@s.whatsapp.net`; // Formato necesario para WhatsApp
        await sock.sendMessage(id, { text: message });
        res.json({ success: true, message: 'Mensaje enviado con éxito' });
    } catch (error) {
        console.error('Error al enviar el mensaje:', error);
        res.status(500).json({ error: 'Error al enviar el mensaje' });
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
 
