#!/usr/bin/env bash

sudo mkdir -p /etc/systemd/system/docker.service.d/
sudo mkdir -p /home/travis/.docker-data
cat << EOF > override.conf
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H unix:// --data-root /home/travis/.docker-data
EOF
sudo mv -f override.conf /etc/systemd/system/docker.service.d/

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"
sudo apt-get update
sudo apt-get -y -o Dpkg::Options::="--force-confnew" install docker-ce

DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
sudo curl -sL -o ./docker-compose https://github.com/docker/compose/releases/download/$DOCKER_COMPOSE_VERSION/docker-compose-`uname -s`-`uname -m`
sudo mv -f ./docker-compose /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

cat /usr/systemd/system/docker.service

docker --version
docker-compose --version
docker info
