import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { HeaderComponent } from '../../components/header/header.component';
import { ProductoService, CotizacionService } from '../../core/services';
import { Producto, CrearCotizacionRequest } from '../../shared/models';

/**
 * Página principal — formulario de cotización.
 *
 * Concepto: Reactive Forms
 * ─────────────────────────
 * En Spring, los datos llegan como un DTO (@RequestBody CrearCotizacionRequest).
 * En Angular, construimos un FormGroup que ESPEJA ese DTO:
 *
 *   FormGroup (cotizacionForm)         ↔  CrearCotizacionRequest.java
 *     ├── FormControl (clienteTelefono) ↔  private String clienteTelefono
 *     ├── FormControl (lugarEvento)     ↔  private String lugarEvento
 *     ├── FormControl (fechaEvento)     ↔  private LocalDate fechaEvento
 *     ├── FormControl (descuento)       ↔  private Integer descuento
 *     ├── FormControl (movilidad)       ↔  private Double movilidad
 *     └── FormArray   (items)           ↔  private List<ItemCotizacionRequest> items
 *
 * Cuando el usuario llena el form, Angular mantiene los valores sincronizados.
 * Al enviar, form.value nos da un objeto JS idéntico al DTO de Java.
 */
@Component({
  selector: 'app-cotizacion',
  imports: [CommonModule, ReactiveFormsModule, HeaderComponent],
  templateUrl: './cotizacion.component.html',
  styleUrl: './cotizacion.component.css'
})
export class CotizacionComponent implements OnInit {

  /**
   * inject() es la forma moderna de inyectar dependencias en Angular.
   * Es equivalente a @Autowired o inyección por constructor en Spring.
   */
  private fb = inject(FormBuilder);
  private productoService = inject(ProductoService);
  private cotizacionService = inject(CotizacionService);

  /** Lista de productos cargados del backend */
  productos: Producto[] = [];

  /** Estado de la UI */
  cargando = false;
  error = '';

  /**
   * FormGroup principal — espeja CrearCotizacionRequest.java
   *
   * FormBuilder.group() es un helper que crea FormControls de forma limpia.
   * Cada entrada es [valorInicial, validadores].
   *
   * Validators son como @Valid + @NotNull en Spring:
   *   Validators.required  = @NotNull
   *   Validators.min(0)    = @Min(0)
   */
  cotizacionForm!: FormGroup;

  /**
   * Getter para acceder al FormArray de items fácilmente desde el template.
   * FormArray = List<ItemCotizacionRequest> en Java.
   */
  get items(): FormArray {
    return this.cotizacionForm.get('items') as FormArray;
  }

  /** Calcula el subtotal sumando todos los items */
  get subtotal(): number {
    return this.items.controls.reduce((sum, item) => {
      const subtotalItem = item.get('subtotalItem')?.value || 0;
      return sum + subtotalItem;
    }, 0);
  }

  /** Calcula el total aplicando movilidad y descuento (misma lógica del backend) */
  get total(): number {
    const descuento = this.cotizacionForm.get('descuento')?.value || 0;
    const movilidad = this.cotizacionForm.get('movilidad')?.value || 0;

    if (descuento > 0) {
      return (this.subtotal + movilidad) - descuento;
    }
    return this.subtotal + movilidad - descuento;
  }

  /**
   * ngOnInit — se ejecuta al inicializar el componente.
   * Equivalente a @PostConstruct en Spring.
   */
  ngOnInit(): void {
    this.initForm();
    this.cargarProductos();
  }

  private initForm(): void {
    this.cotizacionForm = this.fb.group({
      clienteTelefono: ['', Validators.required],
      lugarEvento:     ['', Validators.required],
      tipoEvento:      [''],
      fechaEvento:     ['', Validators.required],
      notas:           [''],
      descuento:       [0, [Validators.required, Validators.min(0)]],
      movilidad:       [0, [Validators.required, Validators.min(0)]],
      items:           this.fb.array([])  // FormArray vacío, se llena al agregar items
    });
  }

  private cargarProductos(): void {
    this.productoService.listarActivos().subscribe({
      next: (data) => this.productos = data,
      error: (err) => this.error = 'No se pudieron cargar los productos. ¿Está corriendo el backend?'
    });
  }

  /**
   * Agrega un item al FormArray.
   * Cada item es un FormGroup que espeja ItemCotizacionRequest.java.
   */
  agregarItem(): void {
    const itemGroup = this.fb.group({
      productoId:          [null, Validators.required],
      cantidad:            [null],
      esIlimitado:         [false],
      precioUnitarioManual:[null],
      // Campos auxiliares solo para la UI (no se envían al backend)
      nombreProducto:      [''],
      precioUnitarioVista: [0],
      subtotalItem:        [0],
    });
    this.items.push(itemGroup);
  }

  /** Elimina un item del FormArray por índice */
  eliminarItem(index: number): void {
    this.items.removeAt(index);
  }

  /**
   * Se ejecuta cuando el usuario selecciona un producto del dropdown.
   * Actualiza los campos del item según la categoría del producto.
   */
  onProductoSeleccionado(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const productoId = itemGroup.get('productoId')?.value;
    const producto = this.productos.find(p => p.id === +productoId);

    if (!producto) return;

    itemGroup.patchValue({ nombreProducto: producto.nombre });

    if (producto.categoria === 'ilimitado') {
      itemGroup.patchValue({
        esIlimitado: true,
        cantidad: null,
        precioUnitarioManual: null,
        precioUnitarioVista: producto.precioUnitario,
        subtotalItem: producto.precioUnitario,
      });
    } else {
      itemGroup.patchValue({
        esIlimitado: false,
        cantidad: null,
        precioUnitarioManual: null,
        precioUnitarioVista: 0,
        subtotalItem: 0,
      });
    }
  }

  /**
   * Se ejecuta cuando el usuario cambia la cantidad de un item tipo "snack".
   * Recalcula precio unitario y subtotal.
   */
  onCantidadCambiada(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const cantidad = itemGroup.get('cantidad')?.value;
    const precioManual = itemGroup.get('precioUnitarioManual')?.value;

    if (!cantidad || cantidad <= 0) {
      itemGroup.patchValue({ precioUnitarioVista: 0, subtotalItem: 0 });
      return;
    }

    // Si hay precio manual, usarlo para calcular subtotal
    if (precioManual && precioManual > 0) {
      itemGroup.patchValue({
        precioUnitarioVista: precioManual,
        subtotalItem: cantidad * precioManual,
      });
    }
  }

  /**
   * Se ejecuta cuando el usuario escribe un precio manual.
   */
  onPrecioManualCambiado(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const cantidad = itemGroup.get('cantidad')?.value;
    const precioManual = itemGroup.get('precioUnitarioManual')?.value;

    if (cantidad && precioManual && precioManual > 0) {
      itemGroup.patchValue({
        precioUnitarioVista: precioManual,
        subtotalItem: cantidad * precioManual,
      });
    }
  }

  /**
   * Envía la cotización al backend y descarga el PDF.
   *
   * 1. Arma el request mapeando el FormGroup → CrearCotizacionRequest
   * 2. Llama a crearYDescargarPdf() del service
   * 3. Crea un link temporal para descargar el PDF
   */
  generarPdf(): void {
    if (this.cotizacionForm.invalid) {
      this.cotizacionForm.markAllAsTouched();
      this.error = 'Completa los campos obligatorios';
      return;
    }

    if (this.items.length === 0) {
      this.error = 'Agrega al menos un item';
      return;
    }

    this.cargando = true;
    this.error = '';

    const formValue = this.cotizacionForm.value;

    // Mapear FormGroup → CrearCotizacionRequest (el DTO del backend)
    const request: CrearCotizacionRequest = {
      clienteTelefono: formValue.clienteTelefono,
      fechaEvento: formValue.fechaEvento,
      tipoEvento: formValue.tipoEvento || '',
      lugarEvento: formValue.lugarEvento,
      notas: formValue.notas || '',
      descuento: formValue.descuento || 0,
      movilidad: formValue.movilidad || 0,
      items: formValue.items.map((item: any) => ({
        productoId: +item.productoId,
        cantidad: item.esIlimitado ? null : +item.cantidad,
        esIlimitado: item.esIlimitado,
        precioUnitarioManual: item.precioUnitarioManual ? +item.precioUnitarioManual : null,
      })),
    };

    this.cotizacionService.crearYDescargarPdf(request).subscribe({
      next: (pdfBlob) => {
        // Crear un link temporal para descargar el PDF
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cotizacion-${formValue.clienteTelefono}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.cargando = false;
      },
      error: (err) => {
        this.error = 'Error al generar el PDF. Verifica los datos e intenta de nuevo.';
        this.cargando = false;
        console.error('Error:', err);
      }
    });
  }
}
