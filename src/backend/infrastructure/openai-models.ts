interface ModelClient {
  models: {
    list(): Promise<{ data: { id: string }[] }>;
  };
}

export class OpenAiModels {
  constructor(private readonly client: () => ModelClient) {}

  async list(): Promise<string[]> {
    const response = await this.client().models.list();
    return [...new Set(response.data.map((model) => model.id))].sort((a, b) => a.localeCompare(b));
  }
}
