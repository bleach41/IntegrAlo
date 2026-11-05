import { Controller, Get, Global, Module } from '@nestjs/common';
import { RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { ModuleRegistryService } from './module-registry.service';

@Controller('modules')
class ModulesController {
  constructor(private readonly registry: ModuleRegistryService) {}

  @RequirePermission(PERMISSIONS.modulesRead)
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
