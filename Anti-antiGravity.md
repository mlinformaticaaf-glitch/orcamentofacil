    useEffect(() => {
      let isMounted = true;
      const fetchData = async () => {
        const data = await apiCall();
        if (isMounted) setStatus(data);
      };
      fetchData();
      return () => { isMounted = false; };
    }, [dependencias]);
    ```

#### 3. Renderização de Listas de Alta Performance
*   **Regra:** Nunca utilizar `.map()`dentro de `ScrollView`para renderizar coleções de dados dinâmicas ou volumosas (como listas de ordens de serviço, logs ou históricos).
*   **Ação:** Substitua obrigatoriamente por `FlatList`ou `FlashList`, garantindo o uso da propriedade `keyExtractor`.

#### 4. Controle de Dependências em Hooks
*   **Regra:** Validar rigorosamente a array de dependências de ùseEffect`, ùseMemo`e ùseCallback`. Nunca passar objetos ou funções diretamente na array sem a devida memorização, evitando loops infinitos de renderização que esgotam a memória do bundle.

---

### 🔍 Comandos de Autocorreção e Diagnóstico (Se o erro ocorrer)
Se o erro Àgent terminate duo antiGravity`for detectado nos logs ou relatado, o agente deve priorizar as seguintes ações de recuperação nesta ordem:

1.  **Limpeza de Estado:** Instruir ou executar o comando de inicialização limpa do Metro Bundler:
    ```bash
    npx expo start -c
    ```
2.  **Varredura de Arquivos:** Analisar os arquivos modificados recentemente procurando por ùseEffect`sem `return`ou estados atualizados de forma cíclica.

---

### 🤖 Exemplo de Ativação no Prompt do Agente:
> *"Você agora possui a Skill Ànti-antiGravity`. Sempre que gerar código em React Native/Expo, valide se todas as assinaturas possuem funções de cleanup e se as requisições assíncronas estão protegidas contra componentes desmontados antes de me entregar o código."*
