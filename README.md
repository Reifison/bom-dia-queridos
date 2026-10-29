<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Bom dia queridos

App React, Vite e Capacitor 8 com conteúdo local como caminho principal. As mensagens, fotografias e fontes essenciais vêm no bundle; abrir o app e consultar a mensagem do dia não exige servidor ou conexão.

## Conteúdo offline

- 108 frases locais, 36 para cada período: manhã, tarde e noite.
- 150 fotos JPEG de 960 × 1200, 50 por período, ocupando 17.470.883 bytes no total (17,47 MB decimais; 16,66 MiB), média de 116 KB por foto; as fontes tipográficas também são locais.
- Fotos e frases são armazenadas separadamente: são 1.800 combinações possíveis por período, 5.400 no total, sem duplicar fotografias para cada frase.
- No iPhone e Android, esse conteúdo já vem na instalação. No navegador, a primeira abertura precisa de conexão para guardar o app e seus recursos no cache offline.
- Na primeira abertura de cada período do dia, o app escolhe uma composição do banco local — fotos do bundle e imagens de IA já salvas — e a persiste no IndexedDB. Reabrir o período no mesmo dia mantém a mesma mensagem e imagem.
- A seleção local mantém histórico por período: evita repetições até consumir o conjunto disponível e, depois, prefere o item menos recente. Se houver alternativa, não repete imediatamente a imagem nem a frase atual.
- O cache da mensagem do dia e o banco persistente de imagens usam bancos IndexedDB separados. Imagens Firebase salvas no banco continuam disponíveis offline; fotos pessoais ficam somente no cartão diário.
- A geração automática de texto usa as frases locais. O app não chama IA para criar o texto diário.

## Desenvolver no computador

**Pré-requisito:** Node.js.

```sh
npm install
npm run dev
```

O Vite abre o app em `http://localhost:3000`. Esse fluxo não precisa de `GEMINI_API_KEY`, `VITE_API_ORIGIN` nem de um servidor Node. `npm run build` cria o bundle estático e `npm run preview` ou `npm run start` o visualiza; atualmente, `npm run start` executa `vite preview` em `http://127.0.0.1:3000`, não a API Express antiga.

A configuração Firebase pública padrão fica em [src/config/firebase.public.json](src/config/firebase.public.json). Os valores `VITE_FIREBASE_*` listados em [.env.example](.env.example) são overrides opcionais. Deixe-os iguais à configuração pública ou sem definição. Não inclua uma chave Gemini no app: Firebase AI Logic gerencia a autorização da Gemini Developer API no serviço.

## Gerar outra imagem

O primeiro toque em **Gerar outra** escolhe uma nova combinação do banco local. Depois dessa troca, um toque seguinte pode solicitar uma imagem com IA, desde que haja conexão, configuração Firebase válida e cota disponível. Há no máximo uma geração bem-sucedida por período e por dia. O Firebase SDK só é carregado nessa ação; não há inicialização de rede de IA na abertura do app. O modelo padrão é `gemini-3.1-flash-image`; imagens geradas podem incorrer em cobrança no plano Blaze.

Quando a IA está indisponível, offline ou falha, o app troca para outra imagem e frase locais e mantém a cota de IA disponível. Após uma geração bem-sucedida, a imagem é preparada em JPEG com o lado maior limitado a 1280 px, proporção preservada e qualidade 0,85. Quando o IndexedDB consegue salvar, ela entra no banco persistente para uso futuro; se o armazenamento falhar, a imagem atual ainda pode ser compartilhada, mas não entra na rotação. Esse banco é separado do cache da mensagem diária.

O projeto Firebase `bom-dia-queridos` já está com faturamento ativo e enforcement do App Check habilitado para Firebase AI Logic:

- iOS: App Attest;
- Android: Play Integrity;
- Web: reCAPTCHA Enterprise score-based, sem desafio visual.

A configuração cliente do Firebase (incluindo a API key pública de identificação do app e a site key do App Check) está em `src/config/firebase.public.json`. Os arquivos nativos são `ios/App/App/GoogleService-Info.plist` e `android/app/google-services.json`. Esses valores públicos não são a chave da Gemini. Nunca coloque `GEMINI_API_KEY` em `VITE_*`, no JSON público ou em código cliente.

O limite diário mostrado pela interface é uma regra de experiência do app; não é um controle financeiro seguro nem impede abuso do serviço. App Check, quotas do provedor e limites de custo do projeto precisam ser acompanhados separadamente.

## Foto pessoal

**Usar minha foto** abre somente a biblioteca de fotos do aparelho, pelo seletor Photos de `@capacitor/camera` 8.2.6; não abre a câmera. A imagem é normalizada para JPEG e fica no cartão/mensagem diária deste aparelho. Ela não entra no banco de rotação, não é enviada ao Firebase nem usada como entrada de geração de IA. O cancelamento do seletor mantém o cartão como estava.

O fluxo guarda uma trava única durante anúncio, seleção e geração para impedir ações duplicadas. Ao navegar para fora, a intenção de trocar o cartão é invalidada; uma imagem de IA que já tenha sido gerada ainda é guardada no banco correspondente.

## Anúncios no fluxo de conteúdo

Na versão atual, a interface não oferece mais os dois créditos de geração por anúncios premiados; os cadastros e as unidades da conta AdMob não foram alterados por essa decisão. No app nativo, um interstitial só é tentado antes de gerar outra imagem, escolher uma foto pessoal ou compartilhar/salvar, quando está pré-carregado, após duas ações elegíveis e respeitando o intervalo mínimo de um minuto. Web, modo offline, falta de anúncio ou consentimento indisponível não bloqueiam a ação de conteúdo.

## Sincronizar os apps nativos

Depois de alterar React, CSS, dependências ou configuração pública, gere e sincronize o bundle:

```sh
npm run ios:sync
npm run ios:open
```

No Xcode, escolha um simulador ou aparelho e execute o app. O iOS usa os recursos locais do bundle; Firebase só é necessário para gerar uma nova imagem com IA.

Para Android:

```sh
npm run android:sync
npm run android:open
```

No Android Studio, escolha um emulador ou aparelho e execute a configuração `app`. Os scripts de release selecionam anúncios reais; os builds de desenvolvimento e teste usam unidades de demonstração. `npm run ios:sync:release` e `npm run android:build:release` definem `VITE_ADS_TESTING=false`. Não use unidades reais para validar builds de teste.

Durante live reload, `server.url` em [capacitor.config.ts](capacitor.config.ts) pode apontar para o Vite no computador. Isso serve apenas para carregar o front-end em desenvolvimento; não configure uma origem de API para o fluxo atual do app.

## Servidor Express legado

O Express e os endpoints `/api/generate-*` permanecem no repositório por compatibilidade com o fluxo antigo; o app atual não depende deles para mensagens, imagens locais ou geração Firebase. `npm run dev:api`, `npm run legacy:server` e a configuração Docker correspondem a esse servidor legado. Nesse fluxo antigo, `GEMINI_API_KEY` é segredo somente do servidor e `VITE_API_ORIGIN` define a origem HTTP da API, se o front-end estiver separado. Nenhuma dessas variáveis é necessária para usar o app atual. `npm run start` não inicia o servidor legado.

## Testes locais

```sh
npm run test:unit
node --import tsx scripts/check-image-bank.mjs
npm run lint
npm run build
```

Os testes unitários usam respostas simuladas e não solicitam imagens pagas nem anúncios reais.

## Registro da migração offline/Firebase inicial (26 de outubro de 2026)

Esta lista preserva os resultados da etapa inicial da migração. O estado mais recente do banco persistente, geração manual e foto pessoal está na seção **Banco persistente, foto pessoal e fluxo manual**.

- [x] Manter mensagens, imagens de base e fontes dentro do app para uso offline.
- [x] Permitir geração Firebase apenas por ação explícita, sem gerar texto por IA.
- [x] Persistir a nova imagem localmente para continuar disponível offline.
- [x] Confirmar uma geração de imagem com o SDK Firebase real; o token temporário usado na validação foi revogado.
- [x] Compilar o app iOS com sucesso.
- [x] Revalidar o build iOS final após a correção do compartilhamento offline e confirmar abertura no simulador.
- [x] Exportar uma imagem JPEG com foto e texto no navegador com o servidor local desligado; evitar espera indefinida pela cópia do texto.
- [x] Executar 63 testes de regressão, validação de tipos e build web.
- [x] Verificar os 30 recursos do cache offline, incluindo seis fotos e cinco fontes, e a ausência de chamadas Hostinger/Gemini legado no bundle do app.
- [ ] Validar App Attest em um iPhone físico. A compilação, por si só, não confirma a atestação física.
- [ ] Confirmar em aparelho físico o carregamento/exibição dos anúncios de demonstração e concluir a validação da conta de anúncios.
- [ ] Distribuir a nova versão pela App Store e validar o fluxo completo no iPhone. A versão publicada continua sendo a anterior até uma nova distribuição.

A geração real de teste entregou um JPEG de 956.271 bytes em aproximadamente 14 segundos. Usou o SDK Firebase e App Check, com credencial temporária de teste revogada ao terminar; isso não substitui o teste do App Attest em hardware real. Não houve publicação nas lojas nem alteração de DNS/hospedagem.

A confirmação final no navegador exportou um JPEG de 143.968 bytes com o servidor local desligado e retornou o botão de compartilhar ao estado disponível. A revisão independente final não encontrou novos bloqueadores no fluxo offline/Firebase e de compartilhamento.

## Banco persistente, foto pessoal e fluxo manual (26 de outubro de 2026)

O app atual abre com uma composição local escolhida para o período e a data do aparelho. Essa composição permanece estável durante o dia e após reabrir o app. O primeiro toque em **Gerar outra** seleciona outra imagem e frase locais; um toque posterior pode usar IA se houver conexão, configuração válida e a cota de uma geração bem-sucedida naquele período/dia. Se a IA estiver indisponível ou falhar, outra combinação local é mostrada. Depois do sucesso da IA, novas trocas voltam a usar o banco.

As 50 imagens e 36 frases de cada período mantêm históricos independentes. A escolha é aleatória entre itens ainda não usados; depois de percorrer o conjunto, prefere os menos recentes e evita repetir a seleção anterior quando existe alternativa. A mesma foto pode voltar com outra frase. O banco de imagens geradas e o cache da mensagem diária ficam em IndexedDB separados. A foto pessoal altera somente o cartão do dia e nunca entra no banco ou no pedido enviado à IA.

A trava de ações fica em `src/lib/dailyContentFlow.ts`; o banco e seus históricos ficam em `src/lib/personalImageBank.ts`; seleção e normalização local da foto ficam em `src/services/personalPhotoService.ts`; mensagens atuais por período/data ficam em `src/lib/periodDayCache.ts`. Os anúncios premiados deixaram de oferecer créditos na interface. O app tenta interstitials pré-carregados após duas ações elegíveis, com intervalo mínimo de um minuto; falha de anúncio ou consentimento não bloqueia a ação.

### Roadmap e validação

- [x] Empacotar e usar 150 fotos JPEG de 960 × 1200 e 108 frases locais, com rotação aleatória baseada em histórico, sem repetição até esgotar o conjunto e com preferência por itens menos recentes depois.
- [x] Persistir separadamente a seleção diária e o banco de imagens geradas, mantendo a composição do dia estável e as imagens de IA disponíveis offline após salvar.
- [x] Implementar o primeiro toque em **Gerar outra** como troca local e permitir até uma geração de IA bem-sucedida por período/dia; usar outra composição local quando IA estiver indisponível ou falhar.
- [x] Implementar **Usar minha foto** com seletor Photos, normalização JPEG e armazenamento somente no cartão local; manter cancelamento sem alteração e não incluir foto pessoal no banco nem na entrada da IA.
- [x] Adicionar trava contra ações simultâneas e interstitial não bloqueante com pré-carregamento, limite de duas ações e intervalo de um minuto; remover a interface dos dois créditos premiados sem alterar conta ou unidades AdMob.
- [x] Executar a suíte consolidada de 82 testes, incluindo migração do banco, frequência de anúncios e preservação da foto em gravações concorrentes; validar tipos/lint e build web.
- [x] Conferir a tela em 393 px sem conteúdo transbordando, selecionar uma foto pelo seletor de arquivos do navegador e confirmar que o cartão a renderiza; observar que o primeiro **Gerar outra** troca por imagem e frase do banco local.
- [x] Confirmar a foto pessoal e a etapa de geração após reabrir o app no navegador.
- [x] Confirmar na versão final a reabertura, troca de foto/frase e exportação com a prévia local desligada; verificar a interface em 393 px e 1506 px sem transbordamento e com abertura pelo topo.
- [x] Confirmar o build iOS final, instalação e abertura no simulador reutilizado (captura em `/tmp/bdq-validation/ios-banco-final.png`).
- [x] Atualizar as três cópias locais da política para descrever o banco offline, Firebase opcional e processamento local das fotos; nenhuma publicação da política foi realizada.
- [ ] Confirmar o seletor Photos nativo em iPhone; a seleção observada no navegador não valida o picker do sistema iOS.
- [ ] Validar App Attest em iPhone físico, exibição real dos anúncios no SDK e Play Integrity em aparelho Android.
- [ ] Distribuir a nova versão pela App Store e Google Play. A compilação não representa publicação.

O build final não valida App Attest em aparelho físico nem carregamento/exibição real de anúncios. A nova versão ainda não foi publicada nas lojas.

No teste do segundo toque no navegador local, a verificação reCAPTCHA/App Check recusou a solicitação de IA. O app retornou uma nova composição do banco sem consumir a cota. A geração real com SDK Firebase foi confirmada na etapa anterior usando credencial temporária de App Check revogada ao terminar; isso não confirma a geração pelo App Attest em um iPhone físico. A proteção não foi desativada para contornar a validação.

O banco IndexedDB usa schema 2, com índice de períodos e migração que preserva as imagens existentes. A seleção consulta os identificadores e carrega somente a imagem sorteada, para evitar ler todo o acervo pessoal a cada troca. A regra de intersticiais respeita a [orientação do AdMob sobre frequência e transições de conteúdo](https://support.google.com/admob/answer/6201362?hl=pt-BR).

## Histórico do servidor publicado

A auditoria de 26/10 registrou, com base nas informações de DNS e do painel do provedor fornecidas naquela análise, que o endpoint legado hospedado na Hostinger respondia HTTP 500 (`GENERATION_FAILED`) para as chamadas de geração de texto e imagem. A causa interna não foi identificada porque não havia acesso aos logs do servidor. O app atual remove essa dependência; o registro histórico abaixo não é instrução para configurar o app atual.

## Auditoria histórica de 26 de outubro de 2026

Este é um retrato da arquitetura antiga, que chamava uma API Express publicada. Os achados e o roadmap abaixo registram o estado naquela auditoria; não são requisitos do app offline/Firebase atual. Restaurar a API da Hostinger e criar geração diária no servidor foram substituídos pela migração acima e não são tarefas pendentes da arquitetura atual.

O foco relatado é iPhone/iOS. O serviço público
`https://bomdiaqueridos.nossateoria.com.br` abre, porém as duas chamadas válidas de
verificação (`generate-image` e `generate-message`, período `morning`) responderam
HTTP 500 com `GENERATION_FAILED`. A resposta publicada não permite distinguir
chave ausente, permissão, modelo ou outro erro interno: o motivo exato depende dos
logs do servidor. Não há chave/ambiente de produção configurado neste checkout.

Na conta AdMob, os apps iOS e Android estão “Pronto”, sem problemas na central de
políticas, e os IDs de app/banner/interstitial/rewarded conferem com o código.
Os dois mostraram zero solicitações e zero impressões nos últimos sete dias;
isso não comprova exibição funcional. As mensagens GDPR e de estados dos EUA
publicadas estavam vinculadas a outro jogo, com os apps Bom dia queridos
explicitamente desmarcados e sem URL de privacidade específica no seletor.

No subdomínio do app, `/app-ads.txt` respondeu HTTP 200 **com HTML da SPA**, em
vez da linha de autorização. Porém, a App Store cadastra `https://nossateoria.com.br/`
como site do desenvolvedor: nesse domínio, `/app-ads.txt` retorna HTTP 200,
`text/plain` e o publisher correto `pub-1257467824403671`. Portanto a inconsistência
no subdomínio não é um bloqueio comprovado do AdMob no iPhone. O arquivo local
`public/app-ads.txt` está correto. `/privacy.html` do app retorna a política.

A cobertura automática de mensagens está habilitada na conta AdMob; a ausência
de vínculo explícito dos dois apps às mensagens exige validação regional, mas não
comprova por si só a causa das zero solicitações observadas. A versão pública
consultada no lookup oficial da App Store foi `1.3.2(1)`, com mínimo iOS 15.

Correções locais e validação têm estados separados:

- [x] Implementar renovação de data, quotas e conteúdo ao atravessar a meia-noite/retomar.
- [x] Persistir mensagens completas e migrar o cache antigo de sessão.
- [x] Deduplicar gerações pendentes e reaproveitar partes bem-sucedidas em novas tentativas.
- [x] Limitar a espera da API, validar respostas e dar opção de tentar novamente.
- [x] Evitar que uma resposta tardia troque a mensagem de outro período.
- [x] Corrigir retorno rápido à navegação e remover controles sem ação.
- [x] Separar anúncios de demonstração dos reais, recuperar falhas de inicialização e serializar banners.
- [x] Esperar eventos de fechamento/recompensa do SDK e liberar a UI ao fechar sem recompensa.
- [x] Incluir testes e validação de tipos do servidor no processo local/CI.
- [x] Validar no navegador persistência após recarregar, renovação no dia seguinte e retry sem gerar outra imagem já pronta.
- [x] Adaptar o ciclo de vida iOS para cenas e confirmar abertura da nova compilação com SDK iOS 27.
- [x] Executar 31 testes de regressão sem Gemini/anúncios reais e validar os tipos do frontend/servidor.
- [ ] Confirmar exibição de banner, interstitial e dois premiados em iPhone físico com unidades de demonstração.
- [ ] Restaurar o Gemini no servidor publicado a partir do erro exato dos logs.
- [x] Confirmar `app-ads.txt` correto no domínio de desenvolvedor cadastrado na App Store.
- [ ] Corrigir também a publicação de `app-ads.txt` no subdomínio do app para consistência.
- [ ] Vincular explicitamente os dois apps às mensagens de consentimento e cadastrar a URL de privacidade.
- [ ] Publicar uma atualização iOS e confirmar solicitações/impressões reais após distribuição.

Melhorias seguintes:

- [ ] Criar geração programada no servidor, com conteúdo persistido, tentativas limitadas e alerta de falha.
- [ ] Aplicar quotas/orçamento no servidor e validar recompensas via SSV quando houver controle financeiro por usuário.
- [ ] Medir erros/latência de geração e carregamento/exibição dos anúncios em produção.
- [ ] Implementar uma biblioteca de mensagens salvas e pesquisa antes de expor esses controles.
- [ ] Consolidar as cópias da política de privacidade e validar compartilhamento com textos longos.
- [ ] Avaliar atualização controlada do plugin AdMob e testar em iPhone físico antes da próxima distribuição.

A compilação Debug inicial falhou ao abrir com a mensagem “UIScene life cycle is
required for apps built with this SDK”. Após adicionar o manifesto de cenas e
`SceneDelegate`, a compilação final instalou e abriu com a interface renderizada.
Essa falha se refere à nova compilação com SDK iOS 27; não comprova a origem do
problema no binário já distribuído. Os deep links continuam encaminhados aos
proxies do Capacitor.

Os logs finais mostram inicialização do framework de anúncios e acesso do UMP ao
serviço de consentimento, mas não confirmam `canRequestAds`, carregamento ou
exibição de anúncios. O controle de interação com Simulator.app não estava
disponível nesta sessão; a abertura/renderização foi confirmada por captura do
simulador. Os testes de eventos de recompensa/dispensa foram automatizados com
eventos simulados, sem contabilizar isso como impressão real do SDK.

Recursos de validação reutilizáveis:

- Simulador existente: **Cofre de Fotos QA**, iOS 27.0, UDID `5C319EC8-D9A9-4E9C-9AE4-7FF820199ED0`.
- Build Debug: `ios/build/DerivedData/Build/Products/Debug-iphonesimulator/App.app`.
- DerivedData estável: `ios/build/DerivedData`. A pasta global `App-fitzlpwneujhadbpwmskbqcqbtcz` pertencia a Rotina-musical, por isso não foi reaproveitada para este projeto.
- Bundle web: `dist/`; dependências: `node_modules/`; cache de pacotes reutilizado: `/Users/reifison/.npm`.
- Capturas e logs: `/tmp/bdq-validation/`. A porta `8891` foi reutilizada primeiro para uma fixture histórica e depois para a prévia estática real; o servidor de prévia foi desligado para validar reabertura e exportação sem ele.
- A compilação nativa de teste usa `VITE_ADS_TESTING=true`; `ios:sync:release` seleciona as unidades reais antes de preparar distribuição. Nenhuma origem de API é necessária para o app atual.
- Android: assets e plugins sincronizados; compilação Gradle e Play Integrity em aparelho físico não foram validados nesta migração.

Referências: [ciclo de vida de apps Apple](https://developer.apple.com/documentation/uikit/managing-your-app-s-life-cycle),
[consentimento do plugin AdMob](https://github.com/capacitor-community/admob/blob/main/docs/consent.md),
[anúncios de teste iOS](https://developers.google.com/admob/ios/test-ads),
[app-ads.txt](https://support.google.com/admob/answer/9363762),
[ficha pública na App Store](https://apps.apple.com/br/app/bom-dia-queridos/id6761698639).

## Referências e padrão visual das artes (26 de outubro de 2026)

O estudo consultou [Google Design sobre escolha de fontes](https://design.google/library/choosing-web-fonts-beginners-guide), [Adobe sobre combinação de fontes e hierarquia](https://www.adobe.com/learn/express/web/font-pairing-guide), [Canva sobre composição, espaço negativo e limite de famílias tipográficas](https://www.canva.com/learn/a-step-by-step-guide-to-designing-from-scratch/), os [cartões fotográficos da Adobe Express](https://www.adobe.com/express/templates/card/photo) e a [referência de contraste da W3C](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum). As referências orientam as escolhas; os tamanhos abaixo são decisões de projeto para esta aplicação, não medidas impostas por essas fontes.

A foto continua em destaque. A frase é o elemento principal, com saudação e assinatura menores. A combinação de uma serifa para a mensagem curta com uma fonte sem serifa nos apoios cria diferença de função sem usar caixa alta pesada ou muitas famílias.

| Elemento | Definição na arte de 1080 × 1350 |
| --- | --- |
| Saudação | Be Vietnam Pro 500, 38 px, caixa normal e vocativo pontuado: “Bom dia, queridos!”, “Boa tarde, queridos!”, “Boa noite, queridos!”. |
| Mensagem | Lora 500, 58 px inicialmente, entrelinha de 1,24 e ajuste de tamanho para conter textos maiores. Quebras de linha equilibradas e tratamento de palavra isolada no final. |
| Assinatura | “app: Bom dia queridos.”, Be Vietnam Pro 400, 18 px, discreta e com contraste escolhido a partir do seu próprio fundo. |
| Composição | Margens de aproximadamente 8%, texto centralizado e largura limitada; a análise local da fotografia escolhe uma região de menor variação visual. |
| Fotos escuras | Texto marfim `#FFFAF0`, saudação champanhe `#F3D5AA` e fundo de apoio azul profundo localizado. |
| Fotos claras | Texto `#17302F`, saudação `#365B50` e fundo marfim localizado. A paleta acompanha a claridade da foto, não apenas o período do dia. |
| Proteção da leitura | Degradê suave apenas atrás do bloco de texto, sem caixa ou borda rígida e sem escurecer a fotografia inteira. Contraste de 4,5:1 serve como referência de projeto; não equivale a certificação de todas as fotos possíveis. |
| Prévia e envio | A tela e o compartilhamento usam o mesmo JPEG renderizado, preservando fonte, cores, crop e posição das palavras. O texto também permanece disponível para leitores de tela e cópia. |
| Uso offline | Lora 500 é empacotada como WOFF2 local, junto com a licença SIL OFL. As fontes de apoio já eram locais; não é necessária outra chamada de IA para aplicar o texto. |

Validação deste refinamento:

- [x] Pesquisar referências primárias na internet e definir papéis de tipografia, composição e cor.
- [x] Corrigir a vírgula das três saudações no cartão, texto copiado e compartilhamento.
- [x] Reduzir a saudação de 58 para 38 px e a assinatura de 22 para 18 px; preservar as versões anteriores de exemplo.
- [x] Unificar prévia e exportação na mesma composição e incluir a fonte local licenciada.
- [x] Conferir a primeira rodada em desktop e celular, com foto noturna e foto clara, e reunir os ajustes de contraste numa única rodada.
- [x] Confirmar a rodada final com foto clara e noturna no navegador a 393 × 852 e exportar os JPEGs reais pelo botão do app, ambos a 1080 × 1350. Amostras: `output/previews/boa-noite-final-v2.jpg` e `output/previews/bom-dia-estudo-final.jpg`.
- [x] Aprovar os 91 testes automatizados, a checagem de tipos e o bundle final; copiar os assets finais para iOS e Android. Os 87 arquivos do cache offline incluem a fonte Lora e sua licença, sem referências ausentes.

Esta rodada reutilizou `dist/`, `node_modules/` e `/tmp/bdq-validation/`; não criou simuladores nem outro diretório de compilação. O simulador e o DerivedData acima permanecem disponíveis para validação nativa futura. A conferência visual desta rodada ocorreu no navegador e não equivale a um teste em iPhone físico ou a uma atualização publicada nas lojas.

Ajuste solicitado para as próximas artes:

- [x] Aplicar o rodapé exato “app: Bom dia queridos.” à prévia e ao compartilhamento dos três períodos, mantendo seu tamanho discreto.
- [x] Exportar e conferir uma imagem final de bom dia e outra de boa tarde, com a nova assinatura. JPEGs reais do app, 1080 × 1350: `output/previews/bom-dia-final-v2.jpg` e `output/previews/boa-tarde-final.jpg`. As amostras anteriores foram preservadas.
- [x] Validar o ajuste com os 13 testes de composição existentes, checagem de tipos, bundle e cópia dos assets para iOS e Android, reutilizando `dist/` e `node_modules/`. Não houve nova compilação nativa nem criação de simuladores; a consulta ao serviço de simuladores estava indisponível nesta rodada e não foi necessária para a exportação pelo navegador.

## Ampliação do acervo offline para 150 fotos

- [x] Medir o acervo anterior: 60 JPEGs de 960 × 1200, 7.729.128 bytes no total (7,73 MB decimais; 7,37 MiB), média de 128.819 bytes por foto.
- [x] Adicionar 30 fotografias distintas por período, com compressão e fonte registradas, chegando a 50 de manhã, 50 de tarde e 50 de noite. As 60 fotos anteriores e seus identificadores foram preservados; a origem das 150 está em `public/images/daily/sources.json`.
- [x] Integrar as fotos à rotação automática e preservar a independência entre imagens e frases. O limite do histórico de reserva passou a acompanhar o acervo: o teste alterna os três períodos por 150 escolhas sem repetir foto antes de esgotar cada conjunto de 50 e confirma a reutilização da foto com outra frase após reabrir o módulo, mesmo sem IndexedDB.
- [x] Validar quantidade, tamanho, dimensões, fontes únicas, hashes e decodificação integral dos JPEGs. O comando `node --import tsx scripts/check-image-bank.mjs` verifica 150 fontes e arquivos distintos, resolução de 960 × 1200, limite de 350 KB por arquivo (incluindo fotos anteriores) e orçamento de 25 MB para o banco.
- [x] Aprovar os 92 testes e a checagem de tipos, compilar o bundle e copiar os assets para iOS e Android. As 150 fotos foram conferidas por hash nas três saídas; o cache offline contém 177 recursos e nenhuma referência ausente.

| Período | Fotos | Frases | Combinações possíveis | Espaço das fotos |
| --- | ---: | ---: | ---: | ---: |
| Manhã | 50 | 36 | 1.800 | 6,44 MB |
| Tarde | 50 | 36 | 1.800 | 6,89 MB |
| Noite | 50 | 36 | 1.800 | 4,14 MB |
| Total | 150 | 108 | 5.400 | 17,47 MB |

O total exato medido é 17.470.883 bytes, média de 116.473 bytes por foto. O maior arquivo é uma foto anterior de 306.839 bytes; as 90 novas somam 9.741.755 bytes, com máximo de 246.704 bytes. Esses valores correspondem ao banco de fotos incluído no app; imagens pessoais/IA salvas depois ocupam espaço adicional. Texto, saudação e assinatura continuam sendo compostos na hora, sem gerar cópias permanentes de cada combinação.

Foram reutilizados `dist/`, `node_modules/`, as pastas públicas existentes de iOS/Android e `/tmp/bdq-validation/acervo/`. O inventário de simuladores existentes foi consultado; nenhum simulador foi criado, modificado ou assumido, e `ios/build/DerivedData` foi preservado. Não houve nova compilação nativa nem publicação nas lojas nesta ampliação. O primeiro teste completo teve três falhas de permissão para abrir a porta local usada nos testes da API; a reexecução autorizada passou 92/92. Registros em `/tmp/bdq-validation/acervo-final.json` e `/tmp/bdq-validation/test-acervo-150-completo.log`.

## Instalação de teste no iPhone Duo físico — 26 de outubro de 2026

- [x] Confirmar o aparelho físico do usuário, modelo `iPhone19,4`, iOS 27.2 e modo de desenvolvedor ativo, sem assumir nenhum simulador.
- [x] Resolver a assinatura com a credencial Apple já configurada e o certificado de desenvolvimento existente. O primeiro build encontrou somente um perfil curinga sem App Attest; o Xcode autenticado preparou um perfil específico para `com.bomdiaqueridos.app`, incluindo o Duo e App Attest. Nenhuma proteção do Firebase foi desativada e nenhum certificado foi revogado.
- [x] Compilar Debug para dispositivo usando `ios/build/DerivedData`, `ios/build/DerivedData/SourcePackages` e suas versões resolvidas, sem limpeza. Saída: `ios/build/DerivedData/Build/Products/Debug-iphoneos/App.app`. A consulta inicial de esquemas do Xcode usou a resolução padrão de pacotes; a compilação efetiva fixou explicitamente os caminhos já existentes.
- [x] Verificar assinatura, inclusão do aparelho no perfil, entitlement de App Attest e os hashes das 150 fotos do pacote contra o banco atual.
- [x] Instalar como atualização, sem desinstalação ou limpeza de dados, e confirmar o registro `com.bomdiaqueridos.app`, versão 1.3.2, build 1.
- [x] Abrir o app no Duo e confirmar que permaneceu em execução (PID 1868 na conferência). A confirmação cobre instalação e processo ativo; a interação visual e os anúncios reais não foram validados por essa verificação.

Logs locais: `/tmp/bdq-validation/ios-duo-signed-build.log`, `duo-install-result.json`, `duo-launch-result.json` e `duo-running-app.json`. Esta instalação usa a configuração de anúncios de teste; não houve publicação na App Store.

## Português e inglês — 26/10/2026

O mesmo app contém os dois idiomas. No iOS, `Bundle.main.preferredLocalizations` é disponibilizado ao conteúdo web antes da inicialização, respeitando também o idioma específico do app nos Ajustes. As localizações `en.lproj` e `pt.lproj` incluem nome e permissões. Português de qualquer região usa o conteúdo português; inglês usa o conteúdo inglês. No navegador, a primeira preferência compatível em `navigator.languages` é usada, com inglês como fallback para idiomas não suportados. O país não substitui uma preferência explícita de idioma.

- [x] Traduzir interface, acessibilidade, avisos, seleção de fotos, compartilhamento e assinatura nas imagens.
- [x] Traduzir as 108 mensagens offline (36 de cada período), saudações e mensagens de geração; encaminhar o idioma à API legada.
- [x] Separar mensagens salvas e histórico de textos por idioma, preservando dados anteriores como português. Imagens sem texto são reutilizadas e a cota diária permanece global.
- [x] Declarar português e inglês no pacote iOS e localizar as permissões nativas.
- [x] Salvar e reler nome, subtítulo, descrição, palavras-chave e novidades no rascunho 1.4.0 da App Store Connect para `en-US`, `en-GB`, `en-AU`, `en-CA` e `pt-PT`. `pt-BR` foi preservado. Fonte dos textos: `store-assets/localizations.json`; comprovante: `output/store-locales-saved.json`.
- [x] Validar TypeScript, 128 testes automatizados, build web/sincronização iOS e compilação Debug para dispositivo.
- [x] Conferir no navegador a interface inglesa, uma mensagem inglesa, e a troca inglês → português → inglês no mesmo armazenamento de teste. Prévia inglesa em `output/locale-english-message.png`.
- [x] Capturar e enviar screenshots em português e inglês para as seis localizações da versão 1.4.0, incluindo o app executando no Duo. Fontes nativas e composições da ficha: `output/app-store/1.4.0/`; estados verificados em `upload-report.json`.
- [x] Validar interface, mensagens e arte em inglês e português no simulador Duo, usando preferências de idioma por execução.
- [ ] Validar a troca de idioma nos Ajustes em um iPhone físico.
- [ ] Concluir a revisão e publicação da versão 1.4.0; acompanhar o estado registrado abaixo.

Recursos reutilizados: `node_modules/`, `dist/`, `ios/App/App/public/`, `ios/build/DerivedData/`, `ios/build/DerivedData/SourcePackages/` e `/tmp/bdq-validation/`. Inventário de simuladores consultado sem iniciar, redefinir ou instalar em nenhum: iPhone Duo `EFFD44A5-4716-43DD-BE1F-FE3CFF4AAF4F` e Cofre de Fotos QA `5C319EC8-D9A9-4E9C-9AE4-7FF820199ED0` estavam ligados e foram preservados. Nenhum simulador/UDID foi utilizado nos testes desta tarefa. Não havia `xcodebuild` em execução antes de reutilizar o diretório. A compilação usou destino genérico iOS, sem assinatura, sem instalação e sem limpeza de caches.

Logs: `/tmp/bdq-validation/test-localization-final.log`, `/tmp/bdq-validation/ios-localization-sync.log` e `/tmp/bdq-validation/ios-localization-build.log`. O primeiro teste completo precisou ser refeito com acesso à porta local da API e com fixtures de idioma explícitas; a rodada final passou integralmente. O banco de teste `localhost` foi usado durante a implementação incompleta; a conferência final utilizou a origem de teste `127.0.0.1` para isolar os dados criados nesse intervalo sem apagar dados existentes.


## Versão 1.4.0 para revisão — 27/10/2026

- [x] Validar TypeScript e os 128 testes, incluindo idiomas, cache e texto nas imagens.
- [x] Conferir a Home no Duo aberto e fechado em paisagem; os três momentos cabem em uma linha.
- [x] Validar capturas nativas PT/EN no Duo (iOS 27.1) e iPad (iOS 27.0).
- [x] Enviar 20 imagens da ficha, processadas em seis localizações, incluindo destaque para o Duo.
- [x] Reutilizar o certificado Apple Distribution existente e gerar somente o perfil App Store que faltava, sem revogações.
- [x] Gerar e enviar o build 2, com anúncios de produção e traduções conferidos no próprio archive. O build 1 foi retirado da revisão após a conferência encontrar assets com anúncios de teste.
- [x] Adicionar `scripts/verify-native-release.mjs` ao fluxo `ios:sync:release`; o guard rejeitou o archive antigo e aceitou o corrigido.
- [x] Submeter o build 2 à revisão. A Apple confirmou `WAITING_FOR_REVIEW` em 27/10/2026, com liberação automática após aprovação. Submissão `b0ad4cec-d803-480f-abf1-0899f07e669d`; build `7a859c48-60bf-4f3e-9f3e-6fcbb0169914`.
- [ ] Publicação da versão 1.4.0 (automática após aprovação).

Recursos reutilizados: `ios/build/DerivedData/`, `ios/build/DerivedData/SourcePackages/`, `node_modules/` e `dist/`. Archives de distribuição preservados em `ios/build/releases/1.4.0/App.xcarchive` (build 1) e `ios/build/releases/1.4.0/build2/App.xcarchive` (build 2). O segundo archive foi necessário porque o primeiro já havia sido enviado e os pacotes da Apple são imutáveis; nenhuma pasta de cache foi clonada. Simuladores existentes: Duo `EFFD44A5-4716-43DD-BE1F-FE3CFF4AAF4F` e iPad `81E3E6CC-F1E8-4E2A-BFD7-9C8FF87E67D2`; nenhum simulador foi criado ou redefinido. Xcode 27.1 (27A9275), SDK iOS 27.1, deployment target 15.0.

Logs: `output/ios-release-archive-build2.log`, `output/ios-release-upload-build2.log`, `output/ios-review-submission-build2.log`, `output/ios-store-screenshots.log` e `output/ios-store-metadata.log`. O upload gerou avisos não fatais de dSYM dos frameworks GoogleMobileAds/UserMessagingPlatform; os archives e símbolos próprios foram preservados. As imagens reais do Duo constam nas capturas localizadas e nas composições da ficha. Não foi solicitado nem confirmado um selo oficial de otimização.

Comprovante final desta submissão: `output/app-store/1.4.0/submission-report.json`. A versão pública permanece anterior até a aprovação da Apple.

## Rejeição 5.1.2(i) e segunda validação — 27/10/2026

A Apple rejeitou 1.4.0 (2) por declarar dados usados para rastreamento sem solicitar App Tracking Transparency. O novo build local é 1.4.0 (3). A solução mantém as declarações existentes e exige autorização antes de iniciar publicidade no iOS.

- [x] Adicionar pedido ATT nativo com janela ativa, independente da região e da configuração de mensagens IDFA do AdMob.
- [x] Incluir `NSUserTrackingUsageDescription` em inglês e português e conferir os textos no archive.
- [x] Impedir inicialização e pedidos de anúncios quando ATT estiver negado, restrito, pendente ou com erro; manter o conteúdo gratuito disponível.
- [x] Revalidar ATT antes de reutilizar a inicialização, carregar/exibir anúncios e ao retornar de Ajustes; invalidar preparados após revogação.
- [x] Concluir o formulário UMP obrigatório antes de iniciar Google Mobile Ads, usando uma ponte nativa que não depende da inicialização do SDK.
- [x] Permitir opções UMP quando o consentimento não autoriza anúncios, suspender novas operações e aguardar preparações em andamento antes de mudar a escolha.
- [x] Passar TypeScript e 143 testes, incluindo cinco testes do serviço real com bridges nativas simuladas para recusa, restrição, revogação, ordem UMP/SDK e concorrência.
- [x] Observar o diálogo ATT no iPad e Duo; recusar no iPad e autorizar no Duo, preservando as escolhas sem apagar dados. Reinstalar a compilação final sobre o app existente e confirmar acesso à mensagem no iPad com a recusa mantida.
- [x] Recompilar Debug e reconstruir o archive local não enviado em `ios/build/releases/1.4.0/build3/App.xcarchive`; conferir assinatura e igualdade do bundle web entre simulador e archive.
- [x] Realizar revisão estática independente dos reforços; nenhum bypass concreto restante foi identificado.
- [x] Preparar as notas que indicam à Apple a localização do ATT, o comportamento ao recusar e a separação do consentimento regional.
- [x] Exportar para distribuição, enviar o build 3, salvar as notas no App Store Connect e ressubmeter. Após a autorização explícita de 27/10/2026, o envio passou e a API confirmou `WAITING_FOR_REVIEW`; comprovante abaixo. O bloqueio anterior pertence à etapa de validação já encerrada.
- [ ] Obter aprovação da Apple e publicar; o último estado remoto confirmado é `WAITING_FOR_REVIEW` para o build 3, com liberação automática após aprovação.

Recursos reutilizados: `node_modules/`, `dist/`, `ios/App/App/public/`, `ios/build/DerivedData/`, `ios/build/DerivedData/SourcePackages/`, o caminho local não enviado `ios/build/releases/1.4.0/build3/` e `/tmp/bdq-validation/`. Archives dos builds 1 e 2 foram preservados. Não foram criados simuladores, clonados caches nem limpos dados. Os simuladores usados foram iPad Pro 13-inch (M5), iPadOS 27.0, UDID `81E3E6CC-F1E8-4E2A-BFD7-9C8FF87E67D2`, e iPhone Duo, iOS 27.1, UDID `EFFD44A5-4716-43DD-BE1F-FE3CFF4AAF4F`. O iPad Air M3 exato da revisão não estava disponível. Inventário de processos e tarefas foi consultado antes da reutilização; as outras tarefas do projeto estavam inativas. Uma tentativa de build coincidiu com `cap sync` e falhou pela mudança de `Package.swift`; após terminar a sincronização, a execução sequencial passou sem limpar caches.

O formulário UMP obrigatório e os cenários de revogação/concorrência foram conferidos nos testes do serviço real com mocks apenas das bridges; não foi forçada uma região EEA nem realizada captura de tráfego. A política HTML foi atualizada localmente, sem publicar o site. A assinatura do archive local foi verificada. A exportação para distribuição, o envio e o processamento da Apple foram concluídos após a autorização de reenvio registrada abaixo. A aprovação da loja não pode ser garantida por testes locais.

Evidências: `output/app-store/1.4.0/att-second-validation.json`, `output/app-store/1.4.0/review-notes-build3.txt`, `output/att-ipad-prompt-pt.png`, `output/att-duo-prompt-pt.png`, `output/att-ipad-final-denied-content.png` e `output/att-duo-final-authorized.png`. Logs finais: `/tmp/bdq-validation/test-att-second-full.log`, `/tmp/bdq-validation/ios-att-second-sync.log`, `/tmp/bdq-validation/ios-att-second-build.log` e `output/ios-att-archive-build3.log`.


## Reenvio do build 3 concluído — 27/10/2026

- [x] Conferir novamente os hashes do archive com a segunda validação, sem recompilar, criar simulador ou duplicar caches.
- [x] Exportar e enviar o pacote usando o certificado de distribuição e o perfil App Store existentes; `EXPORT SUCCEEDED` e `Upload succeeded`.
- [x] Aguardar a Apple processar 1.4.0 (3) como `VALID`.
- [x] Salvar e reler as notas ATT: 2.175 caracteres, SHA-256 `00cf67d9c3dfc3c38f61f87f3d4e1928f5838f19aaa4e05be290db2b39c53a8b`.
- [x] Selecionar o build `4a34c45e-97b6-437b-b896-9e8ed8b813ee` e conferir a associação com a versão 1.4.0.
- [x] Marcar o item rejeitado como corrigido e reenviar a submissão existente. A versão e a submissão retornaram `WAITING_FOR_REVIEW` na leitura final.
- [ ] Aguardar a decisão da Apple; a publicação permanece automática após aprovação (`AFTER_APPROVAL`).

Reenviado em 27/10/2026 às 09:34:58 (America/Campo_Grande). Submissão `b0ad4cec-d803-480f-abf1-0899f07e669d`; versão `bcfb94e3-dcf8-4a83-825c-ec59e89a48ac`. Nenhum screenshot ou idioma foi substituído. Os avisos de ausência de dSYMs dos frameworks GoogleMobileAds e UserMessagingPlatform foram não bloqueantes: a Apple aceitou e validou o pacote. Archives e símbolos próprios foram preservados.

Comprovante atual: `output/app-store/1.4.0/build3-resubmission-report.json`. Logs: `output/ios-att-upload-build3.log` e `output/ios-att-submit-build3.log`. O relatório `att-second-validation.json` permanece como registro histórico da validação anterior ao envio.

## Paridade Android com iOS 1.4.0 — 27/10/2026

- [x] Comparar o pacote Android com o iOS: o Android estava defasado. Sincronizar novamente com o código atual e anúncios de produção.
- [x] Confirmar a equivalência do código principal com o iOS após normalizar somente os nomes gerados dos assets; conferir política de privacidade e hashes dos 151 arquivos de imagens.
- [x] Aprovar checagem de tipos e 143 testes automatizados, sem falhas.
- [x] Confirmar no Google Play a versão pública 1.0.1, código 2; preparar Android 1.4.0, código 3 e notas em português/inglês.
- [x] Localizar o nome nativo Android em inglês e adicionar verificação de pacote de produção e bloqueio de release sem assinatura.
- [x] Concluir compilação nativa Android: `lintRelease`, `testReleaseUnitTest` e `bundleRelease` aprovados.
- [ ] Validar em aparelho Android; nenhum aparelho estava conectado e não existia AVD compatível.
- [x] Localizar a chave original na pasta iCloud `JKS apps`, conferir seu certificado com o Google Play e gerar o AAB assinado.
- [x] Enviar a atualização ao Google Play e confirmar `Alterações em análise`; as verificações rápidas precedem automaticamente a revisão.
- [ ] Obter aprovação do Google e publicar a versão 1.4.0.

Na investigação inicial, a chave de upload não foi encontrada no projeto nem nos locais de credenciais consultados; posteriormente o usuário indicou a pasta iCloud `JKS apps` e a chave correta foi conferida. O certificado público obtido no Google Play tem SHA-256 `58:29:E4:C7:E0:68:03:24:E3:FA:FD:D5:92:11:31:F9:19:5A:E2:0B:55:38:E1:0A:17:76:10:45:A4:A6:AC:2E`. Não foi solicitada redefinição de chave. A compilação e a sincronização não representam envio à loja.

Recursos reutilizados: `node_modules/`, `dist/`, `android/app/src/main/assets/public/`, `/Users/reifison/.npm`, `/Users/reifison/.gradle` e `/tmp/bdq-validation/`. As dependências web precisaram ser restauradas porque a pasta estava ausente. Não existia SDK Android nem AVD no caminho padrão; nenhum simulador/AVD foi criado, redefinido ou utilizado. O inventário de simuladores e processos foi consultado antes das validações. Evidências: `output/android-release/preparation-report.json`, `/tmp/bdq-validation/android-lint.log`, `/tmp/bdq-validation/android-tests.log` e `/tmp/bdq-validation/android-sync-release.log`.

Java 21 foi instalado em `/Users/reifison/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home`, reutilizando as ferramentas Android já existentes em `/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest`. O SDK usa o caminho estável `/Users/reifison/Library/Android/sdk`; ainda não está instalado: a revisão automática rejeitou a aceitação do Android SDK License Agreement por exigir autorização humana direta. A autorização foi solicitada, sem contornar a recusa. A compilação nativa e o envio continuam pendentes.

Após autorização direta do usuário, a licença Android SDK foi aceita e o SDK mínimo foi instalado no caminho estável. O Gradle também instalou automaticamente Build-Tools 35.0.0 e Platform-Tools 37.0.1, exigidos por esta configuração. A chave original permaneceu em `JKS apps`; somente a configuração local ignorada aponta para ela. O certificado do próprio AAB foi conferido com a impressão digital exigida pelo Google Play. A compilação incremental final passou sem limpeza de caches; reutiliza `android/.gradle/`, `android/app/build/`, `android/build/` e `/Users/reifison/.gradle/`. O primeiro lint encontrou três identificadores não traduzíveis; eles foram marcados `translatable="false"` e a execução final passou. Log: `/tmp/bdq-validation/android-native-release.log`.

Envio Android confirmado em 2026-10-27T11:46:29.767356-04:00 (America/Campo_Grande): produção 1.4.0, código 3, lançamento completo após aprovação, publicação gerenciada desativada e países existentes preservados. A página registra **Alterações em análise** e verificações rápidas em andamento, com encaminhamento automático à revisão. O upload passou sem erros e sem perda de dispositivos compatíveis; ficaram apenas os avisos de mapping (minificação desativada) e símbolos de bibliotecas nativas de terceiros. Há 30 avisos não bloqueantes no lint e zero erros; 1 teste nativo passou além dos 143 testes compartilhados. Não houve teste em aparelho Android.

Pacote de distribuição preservado em `output/android-release/app-1.4.0-3.aab`, SHA-256 `01524821b3d39a46f72b48035576736ca23feddc22d4b083e5dc2bd8e130664a`. Essa única cópia de entrega preserva o pacote enviado quando os diretórios de build forem reutilizados. Comprovantes: `output/android-release/preparation-report.json` e `output/android-release/google-play-submission.png`. A publicação não foi confirmada.


## Falhas relatadas na versão da loja — 28/10/2026

O usuário confirmou que recusou o ATT. O código distribuído em 1.4.0 (3) exige autorização ao rastreamento para qualquer anúncio, explicando a ausência de publicidade nesse caso. A correção local permite anúncios não personalizados (`npa: true`) após uma decisão ATT concluída, inclusive recusa/restrição; mantém bloqueio para ATT pendente/com erro e preserva o consentimento regional UMP. O SDK do Google não envia IDFA quando o ATT foi negado: https://developers.google.com/admob/ios/privacy/idfa. A política local foi atualizada; a política hospedada não foi publicada.

A captura mostra a recuperação após falha de IA, mas não informa o erro original. No console Firebase, o plano está Blaze e o app iOS está registrado no App Attest com equipe `A3KB88Q9FH`, igual à assinatura do projeto. Essas verificações não comprovam a atestação no aparelho nem identificam a causa da geração. O app Android apareceu como não registrado no App Check; nenhuma configuração remota foi alterada. A consulta REST com a sessão local antiga retornou 401; a verificação do console ocorreu pela sessão já autenticada no Chrome.

- [x] Identificar o bloqueio de anúncios após recusa ao ATT e preparar a correção local para publicidade não personalizada, preservando UMP.
- [x] Preservar mensagens específicas de falhas de segurança, rede, espera e cota da IA na recuperação local; registrar somente categoria técnica limitada, sem erro bruto ou tokens.
- [x] Validar 35 testes direcionados, TypeScript frontend/servidor e build web com `VITE_ADS_TESTING=false`.
- [ ] Capturar o erro de geração no iPhone físico e corrigir sua causa comprovada.
- [ ] Validar anúncios de demonstração no iPhone com ATT recusado e autorizado.
- [ ] Sincronizar, compilar e distribuir a correção iOS; nenhuma nova versão foi enviada nesta rodada.

Recursos reutilizados: `node_modules/`, `dist/` e `/tmp/bdq-validation/`. Inventário de aparelhos/simuladores e processos consultado antes dos testes; nenhum simulador iniciado, criado, redefinido ou usado. `ios/build/DerivedData/` e archives publicados preservados. Logs: `/tmp/bdq-validation/production-issues-tests.log`, `production-issues-lint.log` e `production-issues-build.log`.


## Teste no Duo físico — 28/10/2026

- [x] Restabelecer o pareamento existente e testar no Duo físico, iOS 27.2, UDID `00008160-001A2CD61A28000A`, com ATT recusado (`status: 2`).
- [x] Compilar e instalar Debug com anúncios de demonstração, sem desinstalação nem limpeza de dados. Reutilizados `ios/build/DerivedData`, `ios/build/DerivedData/SourcePackages`, `dist` e `/tmp/bdq-validation`. Nenhum simulador foi usado.
- [x] Reproduzir o bloqueio UMP e identificar erro nativo `UMP_4`: nenhum formulário configurado para `ca-app-pub-1257467824403671~2501640483`. O plugin AdMob descartava a causa; a ponte iOS própria agora preserva o código numérico, sem iniciar publicidade quando o consentimento está indisponível.
- [x] Reproduzir falha da imagem e identificar `PERSONAL_PHOTO_PROCESSING_FAILED`, posterior ao retorno da imagem pelo serviço de IA; o problema observado está na preparação local.
- [x] Instalar diagnóstico das etapas de preparação, sem registrar a imagem, descrição da geração ou tokens nesse diagnóstico.
- [x] Capturar a etapa exata (`background`, `SHARE_IMAGE_BACKGROUND_EMPTY`), corrigir a preparação dos pixels e revalidar geração no Duo físico. O bloqueio temporário do Device Hub foi resolvido após o usuário liberar o acesso.
- [x] Configurar formulário UMP no AdMob e confirmar anúncio de demonstração; concluído posteriormente na validação registrada abaixo.
- [ ] Enviar correções à App Store.

Relatório: `output/duo-production-issues-validation.json`. O console continua no caminho estável `/tmp/bdq-validation/duo-production-issues-console.log`. A reprodução da falha não significa que a geração foi corrigida ou que houve exibição de anúncios.


### Resultado final da geração no Duo — 28/10/2026

- [x] Decodificar a imagem para `ImageBitmap` antes de desenhá-la no canvas, com fallback limitado para HTMLImageElement, preservação dos bytes até terminar e contexto com `willReadFrequently`. A rejeição de imagens realmente vazias continua ativa.
- [x] Corrigir o ciclo de renovação: somente o SDK nativo renova automaticamente; o CustomProvider JavaScript usa tokens sob demanda. Na execução corrigida, o console não voltou a registrar chamadas repetidas `getToken`; o token válido em cache foi preservado, sem forçar nova atestação.
- [x] Gerar uma imagem de jardim no Duo sem erro, abrir o compartilhamento nativo com miniatura correta de JPEG (318 KB) e confirmar a mesma imagem/frase depois de reabrir o app. Nenhuma mensagem foi enviada a terceiros.
- [x] Executar 146 testes completos, 29 direcionados, checagem de tipos, build iOS assinado e `git diff --check`.
- [x] Configurar/publicar formulário UMP e confirmar anúncios; a rodada posterior no Duo confirmou o desaparecimento de `UMP_4`, banner e intersticial de demonstração.
- [ ] Tratar separadamente o cancelamento nativo de compartilhamento (`Share canceled`), que atualmente abre o fallback Web Share; cancelar a segunda folha retornou ao cartão.
- [ ] Preparar e enviar uma atualização à App Store; a correção validada permanece no build de teste instalado no Duo.

O usuário autorizou reabrir somente o app de teste depois de terminar a geração. A primeira tentativa de reinício havia sido rejeitada pela revisão automática pelo risco de estado não salvo; nenhum reinício foi usado para contornar a recusa antes dessa autorização. A tentativa de recuperar o JPEG temporário depois de cancelar o compartilhamento não encontrou o arquivo, pois o app já o havia removido; nenhuma entrega JPEG local foi criada. O relatório `output/duo-production-issues-validation.json` contém o resultado atual.


## Formulário AdMob publicado e anúncios no Duo — 28/10/2026

- [x] Publicar **Consentimento europeu — Bom dia queridos iOS** exclusivamente para o app iOS `6761698639`, AdMob `ca-app-pub-1257467824403671~2501640483`, com português padrão, inglês adicional e política `https://bomdiaqueridos.nossateoria.com.br/privacy.html` verificada com HTTP 200.
- [x] Manter segmentação no EEE, Reino Unido e Suíça, com consentir, gerenciar opções e recusar nos 32 países correspondentes. A opção de recusa fora desse escopo permaneceu desligada. A revisão automática rejeitou inicialmente o alcance global e depois uma seleção parcial; a seleção completa do escopo europeu foi concluída e publicada, sem alterar outros aplicativos.
- [x] Confirmar no Duo físico iOS 27.2, UDID `00008160-001A2CD61A28000A`, o desaparecimento do `UMP_4` e resposta UMP `NOT_REQUIRED`, `canRequestAds: true`, com ATT recusado (`2`). Não houve reset de consentimento nem alteração da permissão de rastreamento.
- [x] Exibir banner **Test mode** e intersticial **This is an interstitial test ad**, fechar o anúncio e confirmar troca da imagem e retorno dos controles. Não foram clicados anúncios de produção.
- [ ] Validar fornecimento/receita de anúncios de produção após distribuição; os anúncios de demonstração não comprovam inventário real.
- [ ] Distribuir a correção do app na App Store; esta tarefa não enviou build à loja.

Recursos reutilizados: build Debug existente em `ios/build/DerivedData/Build/Products/Debug-iphoneos/App.app`, `ios/build/DerivedData/SourcePackages` e console `/tmp/bdq-validation/duo-production-issues-console.log`. Simuladores existentes inventariados, todos desligados e preservados; nenhum usado, criado ou redefinido. Não houve nova compilação nem cópia de cache. Relatório: `output/admob-duo-validation.json`; eventos nativos filtrados: `output/admob-duo-native-events.log`. A mensagem europeia não foi forçada na região atual do aparelho; o SDK corretamente considerou o consentimento regional não obrigatório e liberou os anúncios.

## Correção Android, consentimento e App Check — 28/10/2026

- [x] Sincronizar as correções compartilhadas de geração de imagem e renovação de App Check no Android; compilar APK Debug com unidades de anúncios de demonstração.
- [x] Concluir `lintDebug` e `testDebugUnitTest` (1 teste nativo, nenhuma falha).
- [x] Ampliar a mensagem publicada do AdMob para os dois apps, renomeando-a para **Consentimento europeu — Bom dia queridos** e incluindo `com.bomdiaqueridos.app`; preservar iOS, idiomas, política de privacidade e os 32 países europeus.
- [x] Vincular Play Integrity ao projeto `bom-dia-queridos` (`631290255780`) e registrar o Android no App Check com o certificado de assinatura da Google Play `80:07:F8:D5:F5:A0:F7:A8:AE:A2:44:58:92:3F:56:10:F3:D4:23:92:97:73:7B:83:C7:5C:29:7A:72:85:F9:77`, TTL de 1 hora. Termos aceitos com autorização expressa do usuário.
- [x] Preservar a aplicação básica do App Check no Firebase AI Logic e as configurações existentes de iOS/web.
- [x] Habilitar a API Cloud Tool Results com autorização expressa; a API Cloud Testing já estava habilitada.
- [x] Executar uma matriz autorizada no Firebase Test Lab, `matrix-1skp3fq6koruk`, `MediumPhone.arm` API 36, português, orientação vertical (26 segundos de teste). Confirmar banner carregado e intersticial exibido; revogar o token temporário ao terminar.
- [x] Concluir a validação da geração e do retorno após fechar anúncio. As falhas iniciais da automação foram corrigidas; a matriz `matrix-ofg18eu46wuqa` passou e confirmou imagem Firebase persistida e intersticial fechado.
- [ ] Validar atestação Play Integrity em uma instalação pela Google Play. O teste virtual com provedor de depuração não comprova essa atestação nem inventário de anúncios de produção.
- [x] Preparar e enviar a atualização 1.4.1/código 4 à revisão da Google Play; publicação automática configurada após aprovação, ainda pendente da Google.

Recursos reutilizados: `android/app/build`, `android/.gradle`, `/Users/reifison/.gradle`, `node_modules`, `dist`, SDK em `/Users/reifison/Library/Android/sdk` e temporários em `/tmp/bdq-validation`. Não havia aparelho Android conectado, AVD nem emulador instalado. O espaço livre era inferior ao download e à execução de um emulador compatível; nenhum AVD, cache duplicado ou diretório de compilação novo foi criado. O dispositivo virtual planejado é `MediumPhone.arm`, API 36, orientação vertical, uma única execução de até 480 segundos. Relatório: `output/android-validation/validation.json`. O AAB anterior `output/android-release/app-1.4.0-3.aab` foi preservado.

Segunda matriz autorizada `matrix-1qnw7nr77l2aa`: 249 segundos de teste, geração sem validação positiva. O formulário UMP foi exibido com as três opções configuradas (captura em `output/android-validation/consent-form-android.jpg`). O pedido real de token nativo recebeu 403 porque o registrador de leitura do segredo estava só no APK de teste; o SDK gerou outro UUID, em vez do token temporário cadastrado. A correção da configuração debug está em preparação. O token temporário desta rodada também foi revogado. Não houve mudança de enforcement nem de IDs de produção.

- [x] Corrigir a descoberta do segredo no build de teste: `firebase-appcheck-debug-testing` agora usa `debugImplementation`; `aapt2` confirmou o registrador no APK Debug final e a configuração release não inclui essa dependência. O teste compara o segredo recebido com o lido pelo provedor sem imprimir seu valor.
- [x] Aguardar o formulário UMP no teste e selecionar apenas “Não consentir” quando presente; verificar fechamento antes de interagir com a tela. Compilar explicitamente APK principal e de instrumentação no mesmo diretório estável.
- [x] Executar a validação após as correções, com autorização posterior para usar até 16 minutos totais sem limite de tentativas; parar no primeiro sucesso, alcançado na matriz `matrix-ofg18eu46wuqa`.

Terceira matriz autorizada `matrix-26452cgzik2f7`: 53 segundos; a verificação de igualdade do segredo de App Check passou e o banner foi confirmado visualmente (`output/android-validation/banner-test.jpg`). A geração não chegou a ser solicitada: o teste parou no anúncio de vídeo com fechamento em duas etapas. O token temporário foi revogado; uma última tentativa de até 480 segundos permanece dentro do limite adicional de 16 minutos autorizado pelo usuário, incluindo o custo normal de geração Gemini informado.

Quarta matriz `matrix-yfsro4fmwvcxa`: 18 segundos, falha no teste de recusa UMP antes da geração. A ação de acessibilidade retornou sucesso, mas o formulário permaneceu aberto. Token temporário revogado. As duas tentativas adicionais autorizadas foram usadas (53 + 18 segundos); não há autorização para outra execução até nova confirmação. Geração Android continua pendente; não foi inferido sucesso a partir de builds ou da configuração remota.

- [x] Trocar também a recusa UMP por toques reais no bounds do texto exato e compilar o teste; adicionar pré-checagem nativa de App Check antes de qualquer interação com anúncio/formulário, sem imprimir JWT.
- [x] Validar o harness após autorização para continuar dentro dos 16 minutos totais: sucesso na quinta matriz; 115 segundos usados nas rodadas adicionais 3–5, sem novas execuções após passar.


### Validação Android concluída — 28/10/2026

- [x] Executar a matriz `matrix-ofg18eu46wuqa` no `MediumPhone.arm`, Android 16/API 36, português e orientação vertical; resultado **SUCCESS**, JUnit sem falhas, 44 segundos de teste.
- [x] Obter atestação real do App Check com o provedor de depuração e segredo temporário correto (`APPCHECK_DEBUG_ATTESTATION_ACCEPTED`); manter o `getToken()` real do plugin no fluxo da imagem.
- [x] Confirmar banner de demonstração carregado e visível, exibir intersticial, fechar pelo controle de fechar e receber o evento nativo `interstitialAdDismissed`.
- [x] Gerar uma imagem real pelo Firebase AI Logic, confirmar persistência com `source=firebase`, verificar preview decodificado e conferir visualmente a imagem final com frase. Evidência: `output/android-validation/firebase-generated-image.jpg`.
- [x] Revogar o token temporário ao terminar e parar no primeiro sucesso. As rodadas adicionais 3–5 consumiram 115 segundos dos 960 autorizados; nenhuma execução adicional foi iniciada após a aprovação.
- [ ] Validar Play Integrity de produção em uma instalação reconhecida pela Google Play; o provedor de depuração do teste não comprova essa etapa.
- [x] Enviar a versão de distribuição 1.4.1/código 4 e configurar publicação automática após aprovação.
- [ ] Confirmar a aprovação da Google e a disponibilidade pública da atualização; o AAB anterior foi preservado.

Evidências finais: `output/android-validation/validation.json`, `test_result_5.xml`, `native-events-final.log`, `banner-test.jpg`, `interstitial-test.jpg`, `consent-form-android.jpg` e `firebase-generated-image.jpg`. O formulário regional não apareceu na rodada final (`NOT_PRESENT`); sua exibição foi comprovada na segunda rodada. A captura direta do screenshot processor antigo falhou por IO, sem afetar as verificações; as imagens de evidência foram extraídas dos vídeos do próprio Test Lab. Os logs brutos, que podem conter tokens transitórios do SDK, ficam privados em `/tmp/bdq-validation` e não foram copiados para os relatórios. Foram reutilizados os caminhos Android existentes, sem AVD novo, limpeza, reset ou cópia de caches. A biblioteca de leitura do segredo foi restrita a `debugImplementation` e não está no classpath release.


## Atualização Android 1.4.1 enviada à Google Play — 28/10/2026

- [x] Confirmar na Play Console a versão pública anterior 1.4.0, código 3, e preparar 1.4.1, código 4.
- [x] Sincronizar os assets Android com `VITE_ADS_TESTING=false` e verificar unidades de anúncios de produção, pacote e configuração Firebase.
- [x] Concluir `lintRelease`, `testReleaseUnitTest` e `bundleRelease`, sem limpeza nem novos diretórios de cache.
- [x] Verificar diretamente o AAB final: assinatura de upload correta, Play Integrity presente, componentes exclusivos de instrumentação/de teste ausentes, versão e pacote corretos. AAB: `output/android-release/app-1.4.1-4.aab`, SHA-256 `7769b4fa3f3675c728683dceb210c001260e64324a74fc7023799e592879b1ab`. AAB 1.4.0 preservado.
- [x] Enviar o novo AAB à faixa de produção, incluir notas PT-BR/EN-US e confirmar ausência de erros bloqueadores ou perda de dispositivos compatíveis. Avisos não bloqueadores: mapa de desofuscação não aplicável com minificação desligada e ausência de símbolos das bibliotecas nativas de terceiros.
- [x] Confirmar envio autorizado à revisão: Play Console mostra **Alterações em análise**, versão **1.4.1**, ação **Iniciar o lançamento completo**. Lançamento em 100% dos usuários nos países já selecionados; publicação gerenciada desativada, portanto publicação automática após aprovação.
- [ ] Receber aprovação da Google e disponibilizar publicamente 1.4.1; a revisão ainda está pendente e a versão pública anterior continua ativa até a liberação.
- [ ] Validar atestação Play Integrity de produção em instalação pela Google Play. O teste funcional aprovado no Test Lab utilizou depuração, sem desativar a proteção de produção.

Relatório de envio: `output/android-release/submission-1.4.1-report.json`. Notas: `store-assets/google-play-1.4.1.json`. Logs reutilizados: `/tmp/bdq-validation/android-release-sync.log`, `/tmp/bdq-validation/android-release-build.log`. Caminhos reutilizados: `android/app/build`, `android/.gradle`, `/Users/reifison/.gradle`, `node_modules`, `dist`. Nenhum simulador criado ou redefinido. A política pública vinculada respondeu HTTP 200; sua versão de 24/08/2026 permaneceu no site e foi revisada sem contradição material com esta correção. Nenhum deploy do site foi feito. A publicação foi expressamente autorizada pelo usuário nesta conversa.
