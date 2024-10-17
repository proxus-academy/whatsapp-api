# Usa una imagen base oficial de Node.js
FROM node:18

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia el archivo package.json y package-lock.json
COPY package*.json ./

# Instala las dependencias de la aplicación
RUN npm install

# Copia el código de la aplicación
COPY . .

# Expone el puerto que usará la aplicación
EXPOSE 3000

# Define el comando para iniciar la aplicación
CMD ["node", "index.js"]

