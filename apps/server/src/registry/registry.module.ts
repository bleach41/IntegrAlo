import { Controller, Get, Global, Module } from '@nestjs/common';
import { ModuleRegistryService } from './module-registry.service';

@Controller('modules')
class ModulesController {
  constructor(private readonly registry: ModuleRegistryService) {}

  @Get()
  list() {
    return this.registry.list();
  }
}

@Global()
@Module({
  controllers: [ModulesController],
  providers: [ModuleRegistryService],
  exports: [ModuleRegistryService],
})
export class RegistryModule {}
